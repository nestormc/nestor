/*jshint node:true*/
"use strict";

var when = require("when");
var mongoose = require("mongoose");
var yarm = require("yarm");

var config = require("./config");
var intents = require("./intents");
var log4js = require("log4js");
var logger = log4js.getLogger("nestor");

var services = {
		config: config,
		intents: intents,
		mongoose: mongoose,
		rest: yarm
	};

var loadPromises = {};
function loadPlugin(moduleName) {
	if (!(moduleName in loadPromises)) {
		var d = when.defer();
		loadPromises[moduleName] = d.promise;

		var plugin;
		try {
			plugin = require(moduleName);
		} catch(e) {
			logger.error("Could not load plugin %s: %s", moduleName, e.message);
			d.reject(e);
		}

		if (plugin) {
			var manifest = plugin.manifest;
			var deps = manifest.dependencies || [];

			loadPlugins(deps).then(function() {
				var pluginServices = Object.create(services);
				pluginServices.logger = log4js.getLogger(manifest.name);

				try {
					plugin(pluginServices);
				} catch(e) {
					logger.error("Could not initialize plugin %s: %s", manifest.name, e.message);
					d.reject(e);
					return;
				}

				logger.info("Loaded plugin %s", manifest.name);

				d.resolve();
			}).otherwise(function(e) {
				d.reject(e);
			});
		}
	}

	return loadPromises[moduleName];
}


function loadPlugins(moduleNames) {
	return when.map(moduleNames, loadPlugin);
}


module.exports = function() {
	return loadPlugins(Object.keys(config.plugins));
};
