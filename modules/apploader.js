/*jshint node:true */
"use strict";

var fs = require("fs"),
	path = require("path"),
	when = require("when"),
	wseq = require("when/sequence"),
	
	config = require("./config"),
	logger = require("./logger"),
	intents = require("./intents"),
	rest = require("./rest"),
	
	apps = {},
	clientApps = [];

exports.init = function(basedir) {
	var dir = path.join(basedir, "apps"),
		services = {
			config: config,
			rest: rest,
			intents: intents
		};
	
	try {
		fs.readdirSync(dir).forEach(function(plugin) {
			apps[plugin.replace(/\.js$/, "")] = {};
		});
	} catch (e) {
		return when.reject(new Error("Could not read plugin directory " + fs.realPathSync(dir) + ": " + e.message));
	}
	
	function loadApp(name) {
		var app;
		
		try {
			app = require(path.join(dir, name));
		} catch(e) {
			return when.reject(e);
		}
		
		if (!app.manifest) {
			return when.reject(new Error("No manifest for app " + name));
		}
		
		if (!app.manifest.disabled) {
			apps[name].module = app;
		}
		
		if (app.manifest.clientApps) {
			app.manifest.clientApps.forEach(function(app) {
				if (!clientApps.some(function(o) { return o.name === app; })) {
					clientApps.push({ _id: name, name: app });
				}
			});
		}
		
		return when.resolve();
	}
	
	function initApp(name) {
		var app;
		
		if (apps[name].loading) {
			return when.reject(new Error("Dependency loop on app " + name));
		} else if (apps[name].loaded) {
			return when.resolve();
		} else if (apps[name].module) {
			apps[name].loading = true;
			app = apps[name].module;
			
			return when.map(
				app.manifest.deps || [],
				initApp
			).then(
				function depsLoaded() {
					var appServices = Object.create(services);
					appServices.logger = logger.createLogger(name);
					
					return app.init(appServices).then(
						function appLoaded() {
							logger.debug("App " + name + " initialized");
							apps[name].loading = false;
							apps[name].loaded = true;
						}
					);
				}
			);
		} else {
			return when.reject(new Error("Unknown or not loadable app: " + name));
		}
	}
	
	// Publish client apps
	rest.arrayResource("clientApps", clientApps);
	
	// Load (require) apps in parallel, then initialize them sequencially
	return when.map(Object.keys(apps), loadApp)
	.then(function() {
		return wseq(
			Object.keys(apps)
			.filter(function(name) {
				return !!(apps[name].module);
			})
			.map(function(name) {
				return initApp.bind(null, name);
			})
		);
	});
};