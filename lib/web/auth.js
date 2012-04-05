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
 * Web user authentication middleware
 */

/*jslint white: true, plusplus: true */
"use strict";

var urlparser = require('url'),
	misc = require('../misc'),
	acl = require('../acl');


module.exports = function(req, res, next) {
	var url = req.urlp = urlparser.parse(req.url, true),
		answer;
		
	// JSON answer helper
	answer = function(userName, salt) {
		var output = {};
		
		if (userName) {
			output.userName = userName;
		} else if (salt) {
			output.salt = salt;
		}
		
		res.json(output);
	};
	
	if (url.pathname === '/salt') {
		// Status/salt request
	
		if (!req.session.salt) {
			req.session.salt = misc.uid(32);
		}
		
		if (req.session.userName) {
			return answer(req.session.userName);
		}
		
		return answer(null, req.session.salt);
	}
	
	if (url.pathname === '/login') {
		// Login attempt
		return acl.authUser(req.body.user, req.body.password, req.session.salt, function(err, granted, configAdmin) {
			if (granted) {
				if (configAdmin) {
					acl.warnAdmin(req.connection.remoteAddress);
				}
				
				req.session.userName = req.body.user;
				answer(req.body.user);
			} else {
				// Login failed (empty answer)
				answer();
			}
		});
	}
	
	if (url.pathname === '/logout') {
		// Logout request
		req.session.destroy();
		res.end('');
		return;
	}
	
	// All other routes need an authenticated user	
	if (req.session.userName) {
		// Authenticated
		return next();
	}
	
	res.writeHead(403, 'not authorized');
	res.end();
};
