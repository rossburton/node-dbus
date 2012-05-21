#! /usr/bin/env node 

var dbus = require('com.izaakschroeder.dbus');
var dbusC = require('../build/Release/dbus');
var DOM = require('com.izaakschroeder.dom');
var events = require("events");
var util = require("util");

bus = dbus.session();

function ExportedObject(iface, path) {
    this.wrap(iface, (function () {
        this.register(path);
    }).bind(this));
    events.EventEmitter.call(this);
}
util.inherits(ExportedObject, events.EventEmitter);

ExportedObject.prototype.wrap = function (iface, callback) {
    var self = this;

    self.introspection_xml = iface;
    /* This is a copy of the introspect method in node-dbus, share it */
    /* TODO: This won't actually block, wait until the callback is done? */
    DOM.parse(iface, function(doc) {
	var res = { interfaces: { } };
	doc.querySelectorAll("interface").forEach(function(iface) {
	    var out = {
		name: iface.getAttribute("name"),
		methods: {},
	    };

            iface.querySelectorAll("method").forEach(function(method) {
		var m = {
		    name: method.getAttribute("name"),
		    inputs: [ ],
		    outputs: [ ]
		};
                
		method.querySelectorAll("arg[direction=in]").forEach(function(arg) {
		    m.inputs.push({ name: arg.getAttribute("name"), type: arg.getAttribute("type") })
		})
                
		method.querySelectorAll("arg[direction=out]").forEach(function(arg) {
		    m.outputs.push({ name: arg.getAttribute("name"), type: arg.getAttribute("type") })
		})
                
		out.methods[m.name] = m;
	    });
	    res.interfaces[out.name] = out;
        });
	self.introspection = res;
	callback();
    });
}

ExportedObject.prototype.register = function (path) {
    var self = this;
    bus.backend.registerObjectPath(path, function (message) {
        /* TODO: don't special-case this but implement it properly */
        if (message.isMethodCall ("org.freedesktop.DBus.Introspectable", "Introspect")) {
            var reply = dbusC.methodReturn(message);
            reply.signature = "s";
	    reply.arguments = [self.introspection_xml];
	    bus.backend.send(reply);
        } else {
	    var args = [message.interface + "." + message.member, message];
	    Array.prototype.push.apply(args, message.arguments);
            self.emit.apply(self, args);
        }
    });
}

ExportedObject.prototype.reply = function (message) {
    var method = this.introspection.interfaces[message.interface].methods[message.member];
    var reply = dbusC.methodReturn(message);

    reply.signature = method.outputs.map(function(i) { return i.type }).join("");
    reply.arguments = Array.prototype.slice.call(arguments, 1);
    bus.backend.send(reply);
}


/* TODO: add node stuff? */
const Iface = "<interface name='com.burtonini.Test'> \
<method name='Stringify'> \
 <arg name='in' direction='in' type='i'/> \
 <arg name='out' direction='out' type='s'/> \
</method> \
<method name='Counter'> \
 <arg name='out' direction='out' type='s'/> \
</method> \
</interface>";

function Something() {
    ExportedObject.call(this, Iface, "/");
    this.count = 0;

    this.on("com.burtonini.Test.Stringify", function (message, number) {
        this.reply(message, "This was number " + number);
    });

    this.on("com.burtonini.Test.Counter", function (message) {
        this.reply(message, "Call number " + (++this.count));
    });
    
    /* TODO Want to do something like this
    this.wrap(Iface, function() {
        this.register("/");
    });
    */
}
util.inherits(Something, ExportedObject);

var something = new Something();
