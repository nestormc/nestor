/*jshint node:true */
"use strict";

var EventEmitter = require("events").EventEmitter,
	logger = require("log4js").getLogger("intents");

var intentEmitter = new EventEmitter();
var startupEmitted = false;

var intents = {
	on: function(intent, handler) {
		logger.debug("Registering handler for intent %s", intent);
		
		if (startupEmitted) {
			logger.warn("Intent handler for %s registered after nestor:startup, intents may have been missed", intent);
		}

		intentEmitter.on(intent, handler);
	},

	emit: function() {
		var intent = arguments[0];

		if (intent === "nestor:startup") {
			startupEmitted = true;
		}

		if (!startupEmitted) {
			logger.warn("Intent %s emitted before nestor:startup, all handlers may not be registered yet", intent);
		}

		if (intentEmitter.listeners(intent).length === 0) {
			logger.warn("Intent %s has no registered handlers", intent);
		} else {
			logger.debug("Intent %s dispatched", intent);
		}

		intentEmitter.emit.apply(intentEmitter, arguments);
	}
};

module.exports = intents;
