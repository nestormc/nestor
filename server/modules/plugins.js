/*jshint node:true*/
"use strict";

var when = require("when");
var mongoose = require("mongoose");
var yarm = require("yarm");
var log4js = require("log4js");

var config = require("./config");
var intents = require("./intents");
var servePluginFiles = require("./server").registerPlugin;

var logger = log4js.getLogger("plugins");

var services = {
		config: config,
		intents: intents,
		mongoose: mongoose,
		rest: yarm
	};

var loadPromises = {};

var recommends = {};

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

			recommends[moduleName] = manifest.recommends || [];

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

				if (manifest.clientDir) {
					servePluginFiles(manifest.name, manifest.clientDir);
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
	return loadPlugins(Object.keys(config.plugins)).then(function() {
		Object.keys(recommends).forEach(function(moduleName) {
			recommends[moduleName].forEach(function(depName) {
				if (!(depName in loadPromises)) {
					logger.warn("%s recommends %s, which was not loaded", moduleName, depName);
				}
			});
		});

		return when.resolve();
	});
};
