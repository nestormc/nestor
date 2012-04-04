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

var urlparser = require('url'),
	express = require('express'),
	acl = require('./acl'),
	misc = require('./misc'),
	config = require('../config'),
	slice = Array.prototype.slice;
	
	
exports.setup = function(baseDir, sessionStore) {
	var web = express.createServer(),
		oneday = 1000 * 60 * 60 * 24,
		authUser, addHandler;

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
			
			res.setHeader('Content-Type', 'application/json');
			res.end(JSON.stringify(output));
		};
		
		if (url.pathname === '/salt') {
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
		
		if (req.session.userName) {
			// Authenticated
			return next();
		}
		
		res.writeHead(403, 'not authorized');
		res.end();
	};
	
	/* Redirect login/logout/salt requests to authentication middleware */
	web.all('/:action(salt|login|logout)', authUser);
	web.listen(config.web.port);
	
	addHandler = function(method/* , [route,] handler [, handler ... ] */) {
		var args = slice.call(arguments),
			method = args.shift(),
			route;
		
		if (typeof args[0] === 'string') {
			route = args.shift();
			args.unshift(authUser);
			args.unshift(route);
		} else {
			args.unshift(authUser);
		}
		
		return web[method].apply(web, args);
	};
	
	return {
		static: function(dir) {
			return web.use(express.static(dir));
		},
		
		get: addHandler.bind(null, 'get'),
		post: addHandler.bind(null, 'post'),
		all: addHandler.bind(null, 'all'),
		
		close: function() {
			web.close();
		}
	};
};
