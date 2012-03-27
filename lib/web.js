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
 * Connect/Express HTTP server setup
 */

/*jslint white: true, plusplus: true */
"use strict";

var misc = require('./misc'),
	urlparser = require('url'),
	express = require('express');
	
	
exports.setup = function(baseDir, config, sessionStore, userCollection) {
	var web = express.createServer(),
		oneday = 1000 * 60 * 60 * 24,
		authUser, checkRights;
		
			
	/* Express configuration */
	web.configure(function() {
		web.use(express.favicon());
		web.use(express.logger({
			immediate: true,
			format: 'dev'
		}));
		web.use(express.bodyParser());
	
		web.use(express.cookieParser());
		web.use(express.session({
			secret: config.web.cookieSecret,
			store: sessionStore,
			cookie: { maxAge: oneday * 30 }
		}));
		
		web.use(web.router);

		web.use(express.static(baseDir + '/static'));
	});
	
	
	/* User authentification middleware */
	authUser = function(req, res, next) {
		var cfg = config.web,
			url = req.urlp = urlparser.parse(req.url, true),
			answer;
			
		// JSON answer helper
		answer = function(userName, salt) {
			var output = {};
			
			if (userName) {
				output.userName = userName;
			} else if (salt) {
				output.salt = salt;
			}
			
			res.end(JSON.stringify(output));
		};
		
		if (url.pathname === '/status') {
			// Status/salt request
		
			if (!req.session.salt) {
				req.session.salt = misc.uid(32);
			}
			
			if (req.session.userName) {
				answer(req.session.userName);
			} else {
				answer(null, req.session.salt);
			}
			
			return;
		}
		
		if (url.pathname === '/login') {
			// Login attempt
			if (cfg.admin.enabled && cfg.admin.user === req.body.user) {
				if (req.body.password === misc.md5(req.session.salt + cfg.admin.password)) {
					req.session.userName = req.body.user;
					answer(req.body.user);
				} else {
					// Login failed
					answer();
				}
			} else {
				userCollection.findOne({ name: req.body.user }, function(err, user) {
					if (!err && user && req.body.password === misc.md5(req.session.salt + user.password)) {
						req.session.userName = req.body.user;
						answer(user.name);
					} else {
						// Login failed
						answer();
					}
				});
			}
			
			return;	
		}
		
		if (url.pathname === '/logout') {
			// Logout request
			req.session.destroy();
			res.end('');
			return;
		}
		
		if (req.session.userName) {
			// Authenticated
			next();
			return;
		}
		
		res.writeHead(403, 'not authorized');
		res.end();
	};
	
	
	/* Redirect login/logout/salt requests to authentication middleware */
	web.all('/:action(salt|login|logout)', authUser);
	
	
	/* User rights middleware */
	checkRights = function(req, res, next) {
		var hasRights = true;
		
		// Placeholder: all rights allowed for now
		if (!hasRights) {
			res.writeHead(403, 'not allowed');
			res.end();
		} else {
			next();
		}
	};
	
	web.listen(config.web.port);
	
	return web;
};
