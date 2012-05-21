#! /usr/bin/env node 

var dbus = require('com.izaakschroeder.dbus');
var dbusC = require('../build/Release/dbus');
var DOM = require('com.izaakschroeder.dom');
var util = require("util");

bus = dbus.session();

function ExportedObject() {
}

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
        if (message.isMethodCall ("org.freedesktop.DBus.Introspectable", "Introspect")) {
            console.log("introspected!");
            
            var reply = dbusC.methodReturn(message);
            reply.signature = "s";
	    reply.arguments = [self.introspection_xml];
	    bus.backend.send(reply);
        } else {
            console.log ("Something else " + message.interface + " " + message.member);

            var method = self.introspection.interfaces[message.interface].methods[message.member];
            /* lets pretend! */
            ret = "Number " + message.arguments[0];

            var reply = dbusC.methodReturn(message);
            reply.signature = method.outputs.map(function(i) { return i.type }).join("");

	    reply.arguments = [ret];
	    bus.backend.send(reply);
            
        }
    });
}




const Iface = "<interface name='com.burtonini.Test'> \
<method name='Flob'> \
<arg name='in' direction='in' type='i'/> \
<arg name='out' direction='out' type='s'/> \
</method> \
</interface>";

function Something() {
    ExportedObject.call(this);
}
util.inherits(Something, ExportedObject);

Something.prototype.Flob = function(number) {
    console.log("Flob!!");
    return "Number " + number;
};

var something = new Something();
something.wrap(Iface, function() {
    something.register("/");
});
