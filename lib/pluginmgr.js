/*
 * Copyright 2010-2012 Nicolas Joyard
 *
 * This file is part of nestor.
 *
 * nestor is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * nestor is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with nestor.  If not, see <http://www.gnu.org/licenses/>.
 */

/**
 * Plugin manager
 */

/*jslint white: true, plusplus: true */
"use strict";

var fs = require('fs'),
	path = require('path'),
	EventEmitter = require('events').EventEmitter,
	express = require('express'),
	mongoose = require('mongoose'),
	async = require('async'),
	logger = require('./logger'),
	cursorCache = require('./ccache'),
	acl = require('./acl'),
	log = logger.createLogger('plugin manager');
	
var pluginInterface, modelInterface;


/* Plugin interface factory. This interface is passed to
   plugins 'init' method. */
pluginInterface = function(emitter, web, name, plugin) {
	var iface = {};
	
	iface.on = function(event, callback) {
		emitter.on(event, callback);
	};
	
	iface.logger = logger.createLogger('plugin:' + name);
	
	iface.getRoute = function(modelName, subroute) {
		return '/plugins/' + name + '/' + modelName + (subroute[0] === '/' ? subroute : '/' + subroute);
	};
	
	return iface;
};


/* Model interface factory */
modelInterface = function(pluginInterface, name) {
	return {
		on: pluginInterface.on,
		logger: pluginInterface.logger,
		getRoute: pluginInterface.getRoute.bind(null, name)
	};
};

exports.statics = { pages: {} };

exports.loadPlugins = function(dir, web, callback) {
	var names = [],
		inits = [],
		statics = exports.statics,
		pluginEmitter = new EventEmitter();
	
	// List loadable plugins
	try {
		fs.readdirSync(dir).forEach(function(plugin) {
			// Treat plugins starting with '_' as disabled
			if (plugin[0] !== '_') {
				names.push(plugin.replace(/\.js$/, ''));
			}
		});
	} catch (e) {
		callback(new Error("Could not read plugin directory " + fs.realPathSync(dir)));
	}
	
	// Load plugins
	names.forEach(function (name) {
		var plugin = require(path.join(dir, name)),
			iface = pluginInterface(pluginEmitter, web, name, plugin);
		
		try {
			// Check plugin metadata
			if (!plugin.metadata) {
				throw new Error("missing metadata");
			}
			
			log.info('Loading plugin %s version %s', plugin.metadata.title, plugin.metadata.version);
			
			// Register static elements
			if (plugin.statics) {
				if (path.existsSync(plugin.statics.dir)) {
					/* Register static dir as /static/<plugin>/ */
					web.subStatic(name, plugin.statics.dir);
				} else {
					log.error('Cannot find static directory %s', plugin.staticDir);
				}
				
				if (plugin.statics.pages) {
					plugin.statics.pages.forEach(function(p) {
						statics.pages[name + '.' + p.require] = {
							require: p.require,
							plugin: name,
							title: p.title 
						}
					});
				}
			}
			
			// Process plugin resources
			plugin.resources = plugin.resources || {};
			Object.keys(plugin.resources).forEach(function (resname) {
				var res = plugin.resources[resname],
					model,
					miface = modelInterface(iface, resname);
			
				// Create model
				if (res.schema) {
					model = miface.model = mongoose.model(name + '_' + resname, res.schema);
				}
			
				// Register routes
				if (res.routes) {
					res.routes.forEach(function(rt) {
						var router = web[rt.method === 'POST' ? 'post' : 'get'].bind(web),
							subroute = rt.route[0] === '/' ? rt.route : '/' + rt.route,
							route = '/plugins/' + name + '/' + resname + subroute,
							action = res.actions[rt.action];
					
						// Express actions shortcut	
						if (typeof action === 'function') {
							action = { type: 'express', code: action };
						}
					
						action = action || { type: 'invalid' };
					
						switch (action.type) {
						case 'express':
							log.debug("Registering route %s for action '%s'", route, rt.action);
							router(route, acl.aclHandler(name, resname, rt.action, action.code.bind(miface)));
							break;
						
						case 'cursor':
							log.debug("Registering route %s for cursor action '%s'", route, rt.action);
							
							// TODO cleanup that ugly mess
							router(route, acl.aclHandler(name, resname, rt.action, function(req, res, next) {
								action.code.call(miface, req, cursorCache.handleCursor.bind(null, req, res, next));
							}));
							break;
					
						default: 
							log.error("Cannot find valid action '%s' for route %s", rt.action, route);
							break;
						}
					});
				}
				
				// Add actions to ACL
				if (res.actions) {
					acl.declareActions(name, resname, Object.keys(res.actions));
				}
			});
				
			// Queue init function
			if (typeof plugin.init === 'function') {
				inits.push(plugin.init.bind(plugin, iface));
			}
		} catch (e) {
			log.error('Could not load %s: %s', name, e.message);
		}
	});
	
	// Call init functions
	async.parallel(inits, function(err) {
		callback(err, pluginEmitter);
	});
};
