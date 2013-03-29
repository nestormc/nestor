/*jshint node:true */
'use strict';

var async = require('async'),
	fs = require('fs'),
	path = require('path'),
	
	config = require('./config'),
	logger = require('./logger'),
	intents = require('./intents'),
	server = require('./server');


module.exports = function(basedir, callback) {
	var initApp, requireLoad,
	
		names = [],
		dir = path.join(basedir, 'apps'),
		loadable = {},
		loaded = {},
		services = {
			config: config,
			server: server,
			intents: intents
		};
	
	/* Dependency-aware app initializing helper */	
	initApp = function(name, cb) {
		var app, depsReady;
		
		if (loaded[name] === 'loading') {
			cb(new Error("Dependency loop on app " + name));
		} else if (loaded[name]) {
			cb(null);
		} else if (loadable[name]) {
			loaded[name] = 'loading';
			app = loadable[name];
			
			depsReady = function(err) {
				if (err) {
					cb(err);
				} else {
					var appServices = Object.create(services);
					appServices.logger = logger.createLogger(name);
					
					app.init(appServices, function(err) {
						if (!err) {
							logger.debug("App " + name + " initialized");
							loaded[name] = app;
						}
						
						cb(err);
					});
				}
			};
			
			async.eachSeries(app.manifest.deps || [], initApp, depsReady);
		} else {
			cb(new Error("Unknown or not loadable app: " + name));
		}
	};
	
	try {
		fs.readdirSync(dir).forEach(function(plugin) {
			names.push(plugin.replace(/\.js$/, ''));
		});
	} catch (e) {
		return callback(new Error("Could not read plugin directory " + fs.realPathSync(dir) + ": " + e.message));
	}
	
	/* App module loader */
	requireLoad = function(name, cb) {
		var app, e;
		
		try {
			app = require(path.join(dir, name));
		} catch(e) {
		}
		
		if (!app.manifest) {
			e = new Error("No manifest for app " + name);
		}
		
		if (!e && !app.manifest.disabled) {
			loadable[name] = app;
		}
		
		return cb(e);
	};
	
	/* Load apps then initialize them */
	async.each(names, requireLoad, function(err) {
		if (err) {
			return callback(err);
		}
		
		async.eachSeries(names, initApp, callback);
	});
};
