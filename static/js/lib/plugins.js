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

/*jslint white: true, browser: true, plusplus: true */
/*global define, require */

/*
 * Web plugin loader
 */

define([
	'ist',
	'lib/server',
	'lib/acl'
], function(ist, server, acl) {
	"use strict";
	
	var plugins = {},
		Page;
	
	/**
	 * Page constructor
	 * Extended with 'extension', defined by plugins page modules
	 */
	Page = function(id, plugin, extension) {
		var self = this;
		
		this.id = id;
		this.plugin = plugin;
		
		// Add plugin-defined extensions
		Object.keys(extension).forEach(function(key) {
			self[key] = extension[key];
		});
		
		// Bind methods with page ID and plugin name
		Object.keys(this._bind).forEach(function(method) {
			self[method] = self._bind[method].bind(self, id, plugin);
		});
		
		this._bind = {};
	};
	
	
	/**
	 * Page prototype ; accessible to plugin pages
	 */
	Page.prototype = {
		// Utilities tree
		utils: {
			// IST template engine
			ist: ist
		},
		
		_bind: {
			asset: function(pageid, plugin, uri) {
				return '/static/' + plugin + (uri.charAt(0) === '/' ? '' : '/') + uri;
			},
		
			// Server requests
			get: function(pageid, plugin, route, callback) {
				route = route.charAt(0) === '/' ? route : '/' + route;
				return server.getJson('/plugins/' + plugin + route, callback);
			},
		
			post: function(pageid, plugin, route, data, callback) {
				route = route.charAt(0) === '/' ? route : '/' + route;
				return server.postJson('/plugins' + plugin + route, data, callback);
			},
		
		
			// ACL request
			haveRight: function(pageid, plugin, right) {
				return acl.haveRight(plugin + ':' + right);
			},
		
		
			// Style addition
			addCSSBlock: function(pageid, plugin, text) {
				var style = ist.createNode('style[type=text/css]');
	
				style.innerHTML = text
					.replace(/#PAGE(?=\W)/g, '.pageViewport[data-page="' + pageid + '"]')
					.replace(/#PLUGIN(?=\W)/g, '.pageViewport[data-plugin="' + plugin + '"]');
				
				document.head.appendChild(style);
			},
		
			addStyleSheet: function(pageid, plugin, href) {
				var self = this;
			
				require(['text!' + this.asset(href)], function(text) {
					self.addCSSBlock(text);
				});
			}
		},
		
		
		/**
		 * Page render function, must pass a DOM node or a document fragment as
		 * second argument to callback, or Error as first argument
		 */
		render: function(callback) {
			callback(null, ist.createNode('"Page did not override render() ! "'));
		},
		
		
		init: function() { }
	};
	
	
	
	plugins.getPages = function(callback) {
		server.getJson('/plugins/statics', function(e, statics) {
			if (e) {
				return callback(e);
			}
			
			var requires = {},
				pdefs = statics.pages,
				pkeys = Object.keys(pdefs),
				pages = [];
			
			// Load pages
			pkeys.forEach(function(pkey) {
				var def = pdefs[pkey],
					plugin = def.plugin;
				
				if (typeof requires[plugin] === 'undefined') {
					// create require context for that particular plugin
					requires[plugin] = require.config({
						context: 'plugin-' + plugin,
						baseUrl: '/static/' + plugin + '/js',
						
						paths: {
							'ist': '/js/ext/ist/ist',
							'assets': '/static/' + plugin
						}
					});
				}
				
				requires[plugin]([def.require], function(pageExt) {
					var page = new Page(pkey, plugin, pageExt);
					
					try {
						page.init();
					} catch(e) {
						return callback(e);
					}
					
					pages.push(page);
					
					if (pages.length === pkeys.length) {
						// Last page loaded
						callback(null, pages);
					}
				});
			});
			
			/*require(pkeys, function() {
				var args = Array.prototype.slice.call(arguments),
					pages = pkeys.map(function(key, index) {
						var def = pdefs[key],
							pext = args[index],
							page = new Page(key, def.plugin, pext);
						
						page.init();
					
						return page;
					});
				
				callback(null, pages);
			});*/
		});
	};
	
	return plugins;
});

