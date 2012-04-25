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
 * Web ACL helper module
 */

define(['lib/server', 'md5'], function(server, md5) {
	"use strict";
	
	var acl = {};
	
	acl.getStatus = function(callback) {
		server.getJson('/salt', function(e, resp) {
			if (e) {
				return callback(e);
			}
			
			if (resp.salt) {
				acl.salt = resp.salt;
			}
			
			callback(null, resp);
		});
	};
	
	
	function doLogin(login, password, salt, callback) {
		server.postJson('/login', {
			user: login,
			password: md5(salt + md5(password))
		}, function(e, resp) {
			if (e) {
				return callback(e);
			}
			
			if (!resp.userName) {
				return callback(new Error("Login failed"));
			}
			
			acl.userName = resp.userName;
			callback(null, resp.userName);
		});
	};
	
	
	function getRights(callback) {
		server.getJson('/acl', function(e, resp) {
			if (e) {
				return callback(e);
			}
			
			acl.rights = resp;
		});
	};
	
	
	acl.login = function(login, password, callback) {
		if (acl.salt) {
			doLogin(login, password, acl.salt, callback);
		} else {
			acl.getStatus(function(e, status) {
				if (e) {
					return callback(e);
				}
				
				if (status.userName) {
					return callback(new Error("Already logged in"));
				}
				
				doLogin(login, password, status.salt, callback);
			});
		}
	};
	
	
	acl.logout = function(callback) {
		server.getJson('/logout', function(e, resp) {
			acl = {};
			callback();
		});
	};
	
	
	acl.haveRight = function(right) {
		return acl.rights.indexOf('admin') !== -1 || acl.rights.indexOf(right) !== -1;
	};
	
	return acl;
});
