/*jshint node:true*/
"use strict";

var registry = require("nestor-plugin-registry");
var when = require("when");
var timeout = require("when/timeout");

var config = require("./config");
var intents = require("./intents");
var log4js = require("log4js");
var logger = log4js.getLogger("nestor");


function loadPlugins() {
	var d = when.defer();
	var services = {
			config: config,
			intents: intents
		};
	
	var names = Object.keys(config.plugins);
	var count = 0;

	registry.on("plugin", function(manifest, initializer) {
		logger.debug("Loaded plugin %s", manifest.name);

		var appServices = Object.create(services);
		appServices.logger = log4js.getLogger(manifest.name);

		try {
			initializer(appServices);
		} catch(e) {
			logger.error("Could not initialize plugin %s: %s", manifest.name, e.message);
			d.reject(e);
		}

		count++;

		if (count === names.length) {
			// All plugins have been loaded
			d.resolve();
		}
	});

	for (var i = 0; i < names.length; i++) {
		var name = names[i];

		try {
			require(name);
		} catch(e) {
			logger.error("Could not load plugin %s: %s", name, e.message);
			return when.reject(e);
		}
	}

	logger.debug("Loaded %d plugins", names.length);

	return timeout(1000, d.promise);
}


module.exports = loadPlugins;