#! /usr/bin/env node 

var dbus = require('com.izaakschroeder.dbus');
var util = require("util");

/* TODO: add node stuff? */
const Iface = "<interface name='com.burtonini.Test'> \
<method name='Stringify'> \
 <arg name='in' direction='in' type='i'/> \
 <arg name='out' direction='out' type='s'/> \
</method> \
<method name='Counter'> \
 <arg name='out' direction='out' type='s'/> \
</method> \
<method name='Map'> \
 <arg name='out' direction='out' type='a{ss}'/> \
</method> \
</interface>";

var bus = dbus.session();

function Something() {
    dbus.ExportedObject.call(this, bus, Iface, "/");
    this.count = 0;

    this.on("com.burtonini.Test.Stringify", function (message, number) {
        this.reply(message, "This was number " + number);
    });

    this.on("com.burtonini.Test.Counter", function (message) {
        this.reply(message, "Call number " + (++this.count));
    });

    this.on("com.burtonini.Test.Map", function (message) {
        this.reply(message, { "Foo": "Bar" });
    });
}
util.inherits(Something, dbus.ExportedObject);

var something = new Something();
