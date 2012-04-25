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
 * ACL configuration plugin
 */

/*jslint white: true, plusplus: true */
"use strict";

var acl = require('../../lib/acl');

exports.metadata = {	
	title: "ACL configuration plugin",
	version: "0.1",
	author: "Nicolas Joyard"
};

exports.statics = {
	dir: __dirname + '/static',
	category: 'Configuration',
	
	pages: [ { title: 'Rights', require: 'rights' } ]
};

exports.resources = {
	rights: {
		routes: [
			{ route: '/', action: 'list' }
		],
		
		actions: {
			list: function(req, res, next) {
				var realms = [];
				
				Object.keys(acl.realms).forEach(function(realmName) {
					var realm = acl.realms[realmName],
						rdef = { name: realmName, models: [] };
				
					Object.keys(realm).forEach(function(modelName) {
						rdef.models.push({ name: modelName, rights: realm[modelName] });
					});
				
					realms.push(rdef);
				});
			
				res.json(realms);
			}
		}
	},
	
	groups: {
		routes: [
			{ route: '/', action: 'list' },
			{ route: '/edit', action: 'edit', method: 'POST' },
			{ route: '/del', action: 'del', method: 'POST' }
		],
		
		actions: {
			list: {
				type: 'cursor',
				code: function(req, callback) {
					callback(null, acl.Group.find().fields(['name', 'rights']));
				}
			},
			
			edit: function(req, res, next) {
				
			},
			
			del: function(req, res, next) {
				
			}
		}
	},
	
	users: {
		routes: [
			{ route: '/', action: 'list' },
			{ route: '/edit', action: 'edit', method: 'POST' },
			{ route: '/del', action: 'del', method: 'POST' }
		],
		
		actions: {
			list: {
				type: 'cursor',
				code: function(req, callback) {
					callback(null, acl.User.find().field(['name', 'groups']));
				}
			},
			
			edit: function(req, res, next) {
				
			},
			
			del: function(req, res, next) {
				
			}
		}
	}
};	

