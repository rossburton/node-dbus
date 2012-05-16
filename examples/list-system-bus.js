#! /usr/bin/env node 

var dbus = require('com.izaakschroeder.dbus');

/* The DBus daemon service */
var dbus_service = dbus.system("org.freedesktop.DBus");
/* The daemon object on that service */
var dbus_object = dbus_service.object("/org/freedesktop/DBus")
/* The daemon interface on that object */
var dbus_iface = dbus_object.as("org.freedesktop.DBus");

/* When the proxy is ready (introspection is async)... */
dbus_iface.on("ready", function () {
        /* Invoke listNames to list the names registered on the bus */
        dbus_iface.listNames(function (err, names) {
                /* First argument is always an error, or undefined */
		if (err)
			throw new Error('Unable to list names: ' + err);
                
                /* names is a DBus "as", so is an array of string in Node */
                console.log(names);
                process.exit(0);
        });
});
