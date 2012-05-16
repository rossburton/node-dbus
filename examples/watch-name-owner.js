#! /usr/bin/env node 

var util = require("util");
var dbus = require('com.izaakschroeder.dbus');

/* The DBus daemon service */
var dbus_service = dbus.session("org.freedesktop.DBus");
/* The daemon object on that service */
var dbus_object = dbus_service.object("/org/freedesktop/DBus")
/* The daemon interface on that object */
var dbus_iface = dbus_object.as("org.freedesktop.DBus");

/* When the proxy is ready (introspection is async)... */
dbus_iface.on("ready", function () {
        /* When the NameOwnerChanged signal is emitted... */
	dbus_iface.on("NameOwnerChanged", function(name, old_owner, new_owner) {
                console.log(util.format("NameOwnerChanged on %s", name));
                if (old_owner && new_owner)
                        console.log (util.format("Was %s, now %s", old_owner, new_owner));
                else if (!old_owner && new_owner)
                        console.log (util.format("Now %s", new_owner));
                else if (old_owner && !new_owner)
                        console.log (util.format("Was %s", old_owner));
                console.log();
	})
});
