
var 
	DOM = require('com.izaakschroeder.dom'),
	util = require('util'),
	dbus = require('./build/Release/dbus'),
	EventEmitter = require('events').EventEmitter;



/**
 * DBus
 * This wraps a bus object.
 */
function DBus(bus, destination) {
	switch(typeof bus) {
	case "number":
		this.backend = dbus.get(bus);
		break;
	case "object":
		this.backend = bus;
		break;
	default:
		throw new Error("Unhandled bus type " + typeof bus);
	}
	
	this.destination = destination;
}


DBus.SYSTEM = dbus.DBUS_BUS_SYSTEM;
DBus.SESSION = dbus.DBUS_BUS_SESSION;

DBus.get = function(bus, destination) {
	return new DBus(bus, destination);
}

DBus.system = DBus.get.bind(undefined, DBus.SYSTEM);
DBus.session = DBus.get.bind(undefined, DBus.SESSION);

DBus.prototype.close = function() {
	this.backend.close();
}

DBus.prototype.object = function(path) {
	return new DBusObject(this, path);
}

/**
 * DBusObject
 * Wraps a DBus object.
 *
 */
function DBusObject(bus, path) {
	EventEmitter.call(this);
	this.bus = bus;
	this.path = path;
	this.introspection = undefined;
	var self = this;

	//Call the C++ code to register a filter for incoming signals
	bus.backend.addFilter((function(message) {
		if (message.type == dbus.DBUS_MESSAGE_TYPE_SIGNAL) { //If it's a signal
			/* TODO: filter for ones we care about */
			//Emit it
			var args = [(message.interface+"."+message.member).toLowerCase()];
			Array.prototype.push.apply(args, message.arguments);
			this.emit.apply(this, args);
			// TODO? delete message;
		}
		return dbus.HANDLER_RESULT_NOT_YET_HANDLED;
	}).bind(this));
}
util.inherits(DBusObject, EventEmitter);

DBusObject.prototype.introspect = function(callback) {

	if (this.introspection)
		return this.introspection;

	var self = this, message = dbus.methodCall(this.bus.destination, this.path, "org.freedesktop.DBus.Introspectable", "Introspect");

	this.bus.backend.send(message, -1, function(response) {
            /* TODO: error handling */
		DOM.parse(response.arguments[0], function(doc) {

			var res = { interfaces: { } };

			doc.querySelectorAll("interface").forEach(function(iface) {
				
				var out = { 
					name: iface.getAttribute("name"),
					methods: [ ],
					signals: [ ]
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

					out.methods.push(m);
				})
				
				iface.querySelectorAll("signal").forEach(function(signal) {
					var m = {
						name: signal.getAttribute("name"),
						arguments: [ ]
					};

					signal.querySelectorAll("arg").forEach(function(arg) {
						m.arguments.push({ name: arg.getAttribute("name"), type: arg.getAttribute("type") })
					})

					out.signals.push(m);
				})

				res.interfaces[out.name] = out;

			})
			
			self.introspection = res;
			callback(res);
		});
	})
}

DBusObject.prototype.as = function(interfaceName) {
	return new DBusProxy(this, interfaceName);
}

/**
 * DBusProxy
 */
function DBusProxy(object, interfaceName) {

	if (typeof interfaceName !== "string")
		throw new TypeError("Interface must be a string!");

	EventEmitter.call(this);
	var self = this;
	
	this.bus = object.bus;
	this.interfaceName = interfaceName;
	this.object = object;

	object.introspect(function(data) {
		var dbusInterface = data.interfaces[interfaceName];
		
		if (typeof dbusInterface === "undefined")
			throw new Error("Unable to get interface "+interfaceName+"!");

		dbusInterface.methods.forEach(function(method) {
			var name = method.name;
			name = name.charAt(0).toLowerCase() + name.slice(1);

			
			self[name] = function() {
				var message = dbus.methodCall(self.bus.destination, object.path, dbusInterface.name, method.name), callback = arguments[arguments.length - 1];

				if (typeof callback !== "function")
					throw new TypeError("Callback must be a function!");

				message.signature = method.inputs.map(function(i) { return i.type }).join("");
				message.arguments = Array.prototype.slice.call(arguments, 0, -1);

				
				self.bus.backend.send(message, -1, (function(callback, reply) {

					switch(reply.type) {
					case dbus.DBUS_MESSAGE_TYPE_METHOD_RETURN:
						var results = !reply.arguments ? [] : Array.prototype.slice.call(reply.arguments).map(function(arg, i) {
							var signature = method.outputs[i];
							if (signature.type === "o") {

								return self.bus.object(arg);
							}
							return arg;
						});
						results.unshift(undefined);
						callback.apply(undefined, results);
						break;
					case dbus.DBUS_MESSAGE_TYPE_ERROR:
						callback(reply.error);
						break;
					case dbus.DBUS_MESSAGE_TYPE_INVALID:
					case dbus.DBUS_MESSAGE_TYPE_METHOD_CALL:
					case dbus.DBUS_MESSAGE_TYPE_SIGNAL:
						console.log("INVALID");
						break;
					}

					
				}).bind(undefined, callback))
			}
		})
		self.emit("ready");
	})
}
util.inherits(DBusProxy, EventEmitter)

DBusProxy.prototype.on = function(method, listener) {
	var self = this, event = (this.interfaceName+"."+method).toLowerCase();

	/* "ready" is special, everything else is a DBus signal */
	if (method != "ready") {
		var rule = util.format("type='signal',interface='%s',member='%s'",
					this.interfaceName,
				       method);
		this.bus.backend.addMatch(rule);
	}

	this.object.on(event, function() {
		var args = [method];
		Array.prototype.push.apply(args, arguments);
		self.emit.apply(self, args);
	})
	return EventEmitter.prototype.on.apply(this, arguments);
}


/**
 * ExportedObject
 * Inherit this and you can put your local object on the bus.
 */
DBus.ExportedObject = function(bus, iface, path) {
    EventEmitter.call(this);

    this.wrap(iface, (function () {
        this.register(bus, path);
    }).bind(this));
}
util.inherits(DBus.ExportedObject, EventEmitter);

DBus.ExportedObject.prototype.wrap = function(iface, callback) {
    var self = this;
    this.introspection_xml = iface;

    /* This is almost a copy of the introspect method in DBusObject, share it? */
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

DBus.ExportedObject.prototype.register = function(bus, path) {
    this.bus = bus;
    var self = this;
    bus.backend.registerObjectPath(path, function (message) {
        /* TODO: don't special-case this but implement it properly */
        if (message.isMethodCall ("org.freedesktop.DBus.Introspectable", "Introspect")) {
            var reply = dbus.methodReturn(message);
            reply.signature = "s";
	    reply.arguments = [self.introspection_xml];
	    self.bus.backend.send(reply);
        } else {
	    var args = [message.interface + "." + message.member, message];
	    Array.prototype.push.apply(args, message.arguments);
            self.emit.apply(self, args);
        }
    });
}

DBus.ExportedObject.prototype.reply = function(message) {
    var method = this.introspection.interfaces[message.interface].methods[message.member];
    var reply = dbus.methodReturn(message);

    reply.signature = method.outputs.map(function(i) { return i.type }).join("");
    reply.arguments = Array.prototype.slice.call(arguments, 1);
    this.bus.backend.send(reply);
}

module.exports = DBus
