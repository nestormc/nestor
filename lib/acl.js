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
 * Access control
 */

/*jslint white: true, plusplus: true */
"use strict";

var util = require('util'),
	mongoose = require('mongoose'),
	Schema = mongoose.Schema,
	log = require('./logger').createLogger('acl'),
	misc = require('./misc'),
	config = require('../config');
	
var realms = {},
	userSchema, User, groupSchema, Group;


/* Schema/model definitions */

userSchema = new Schema({
	name: { type: String, unique: true },
	passmd5: String
});

User = mongoose.model('user', userSchema);

groupSchema = new Schema({
	name: { type: String, unique: true },
	users: [String],
	rights: [String]
});

Group = mongoose.model('group', groupSchema);


/* Declare actions for a model in a given realm (eg. plugin name) */

exports.declareActions = function (realm, model, actions) {
	realms[realm] = realms[realm] || {};
	realms[realm][model] = actions;
};


/* Authenticate user with salted password */
exports.authUser = function(host, user, passalted, salt, callback) {
	var admin = config.web.admin;
	
	if (admin.enabled && admin.user === user) {
		log.warn('Config-based admin user authenticated from %s', host);
		return callback(null, misc.md5(salt + misc.md5(admin.password)) === passalted);
	}
	
	User.findOne(
		{ name: user },
		{ fields: [ 'passmd5' ] }, 
		function (err, user) {
			var granted;
			
			if (err) {
				return callback(err);
			}
			
			if (!user) {
				return callback(null, false);
			}
			
			granted = misc.md5(salt + user.passmd5) === passalted;
			callback(null, granted);
		}
	);
};


/* Check if user has been granted a specific right. Can be called as specified
	in the argument list or as hasRight(user, "realm:model.action", callback)
*/
exports.hasRight = function(user, realm, model, action, callback) {
	var admin = config.web.admin,
		right;
		
	if (typeof model === 'function') {
		// hasRight(user, right, callback) form
		right = realm;
		callback = model;
	} else {
		// Canonical form
		right = util.format('%s:%s.%s', realm, model, action);
	}
	
	// Admin user has all rights
	if (admin.enabled && admin.user === user) {
		return callback(null, true);
	}
	
	Group.count(
		{ users: user, rights: right },
		function (err, count) {
			if (err) {
				return callback(err);
			}
		
			callback(null, count > 0);
		}
	);
};


/* Create ACL-aware handler from existing handler */
exports.aclHandler = function(realm, model, action, handler) {
	var right = util.format('%s:%s.%s', realm, model, action);
	
	return function(req, res, next) {
		var user = req.session.userName;
		
		exports.hasRight(user, right, function(err, granted) {
			if (err) {
				return next(err);
			}
			
			if (granted) {
				return handler(req, res, next);
			}
			
			res.writeHead(403, 'access denied');
			res.end();
		});
	};
};
