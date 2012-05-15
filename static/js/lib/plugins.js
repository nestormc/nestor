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
		var self = this,
			routify;
		
		this.id = id;
		this.plugin = plugin;
		
		// Add plugin-defined extensions
		Object.keys(extension).forEach(function(key) {
			self[key] = extension[key];
		});
		
		routify = function(prefix, uri) {
			return prefix + plugin + (uri.charAt(0) === '/' ? '' : '/') + uri;
		};
		
		this.asset = routify.bind(null, '/static/');
		
		// Server requests
		this.get = function(route, callback) {
			if (Array.isArray(route)) {
				route = route.map(routify.bind(null, '/plugins/'));
			} else {
				route = routify('/plugins/', route);
			}
			
			return server.getJson(route, callback);
		};
	
		this.post = function(route, data, callback) {
			if (Array.isArray(route)) {
				route = route.map(routify.bind(null, '/plugins/'));
			} else {
				route = routify('/plugins/', route);
			}
			
			return server.postJson(data, callback);
		};
	
		// ACL request
		this.haveRight = function(right) {
			return acl.haveRight(plugin + ':' + right);
		};
	
		// Style addition
		this.addCSSBlock = function(text) {
			var style = ist.createNode('style[type=text/css]');

			style.innerHTML = text
				.replace(/#PAGE(?=\W)/g, '.pageViewport[data-page="' + id + '"]')
				.replace(/#PLUGIN(?=\W)/g, '.pageViewport[data-plugin="' + plugin + '"]');
			
			document.head.appendChild(style);
		};
	
		this.addStyleSheet = function(href) {
			require(['text!' + this.asset(href)], function(text) {
				self.addCSSBlock(text);
			});
		};
	};
	
	Page.prototype = {
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
							'dom': '/js/lib/dom',
							'assets': '/static/' + plugin
						}
					});
				}
				
				requires[plugin]([def.require], function(pageExt) {
					var page = new Page(pkey, plugin, pageExt),
						cb = callback;
					
					try {
						page.init();
					} catch(e) {
						callback = function() {};
						return cb(e);
					}
					
					pages.push(page);
					
					if (pages.length === pkeys.length) {
						// Last page loaded
						callback(null, pages);
					}
				});
			});
		});
	};
	
	return plugins;
});

