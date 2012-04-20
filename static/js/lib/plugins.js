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
	'lib/server'
], function(ist, server) {
	"use strict";
	
	var plugins = {},
		Page;
	
	/**
	 * Page constructor
	 * Extended with 'extension', defined by plugins page modules
	 */
	Page = function(id, plugin, extension) {
		var self = this;
		
		self.id = id;
		self.plugin = plugin;
		
		Object.keys(extension).forEach(function(key) {
			self[key] = extension[key];
		});
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
		
		// Init function, called on load ; may be overriden
		init: function() {},
		
		// Page render function, must return a DOM node or a document fragment
		render: function() {
			return this.utils.ist.createNode('"Page did not override render() ! "');
		}
	};
	
	
	
	plugins.getPages = function(callback) {
		server.getJson('/plugins/statics', function(e, statics) {
			if (e) {
				return callback(e);
			}
			
			var pdefs = statics.pages,
				pkeys = Object.keys(pdefs);
			
			// Load pages
			require(pkeys, function() {
				var args = Array.prototype.slice.call(arguments),
					pages = pkeys.map(function(key, index) {
						var def = pdefs[key],
							pext = args[index],
							page = new Page(key, def.plugin, pext);
						
						page.init();
					
						return page;
					});
				
				callback(null, pages);
			});
		});
	};
	
	return plugins;
});

