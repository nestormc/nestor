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
	mongoose = require('mongoose'),
	logger = require('./logger'),
	cursorCache = require('./ccache'),
	log = logger.createLogger('plugin manager');
	
var cursorHandler, expressHandler, pluginInterface, modelInterface;

cursorHandler = function(actionFn, req, res, next) {
	// TODO check rights

	actionFn.call(this, req, cursorCache.handleCursor.bind(null, req, res, next));
};

expressHandler = function(pluginName, resourceName, actionName, actionFn, req, res, next) {
	// TODO: check rights
	
	actionFn.call(this, req, res, next);
};

/* Plugin interface factory. This interface is passed to
   plugins 'init' method. */
pluginInterface = function(emitter, web, name, plugin) {
	var iface = {};
	
	iface.on = function(event, callback) {
		emitter.on(event, callback);
	};
	
	iface.logger = logger.createLogger('plugin:' + name);
	
	iface.getRoute = function(modelName, subroute) {
		return '/r/' + name + '/' + modelName + (subroute[0] === '/' ? subroute : '/' + subroute);
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

exports.loadPlugins = function(dir, web, callback) {
	var names = [],
		plugins = {},
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
							route = '/r/' + name + '/' + resname + subroute,
							action = res.actions[rt.action];
					
						// Express actions shortcut	
						if (typeof action === 'function') {
							action = { type: 'express', code: action };
						}
					
						action = action || { type: 'invalid' };
					
						switch (action.type) {
						case 'express':
							log.debug("Registering route %s for action '%s'", route, rt.action);
							router(route, expressHandler.bind(miface, name, resname, rt.action, action.code));
							break;
						
						case 'cursor':
							log.debug("Registering route %s for cursor action '%s'", route, rt.action);
							router(route, cursorHandler.bind(miface, action.code));
							break;
					
						default: 
							log.error("Cannot find valid action '%s' for route %s", rt.action, route);
							break;
						}
					});
				}
			});
		} catch (e) {
			log.error('Could not load %s: %s', name, e.message);
		}
	});
	
	// TODO call plugin init
	
	callback(null, pluginEmitter);
};
