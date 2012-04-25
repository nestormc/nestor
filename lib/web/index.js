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
 * Connect/Express HTTP server
 */

/*jslint white: true, plusplus: true */
"use strict";

var	setup = require('./setup'),
	router = require('./router'),
	log = require('../logger').createLogger('web');

exports.setup = function(sessionStore, sessionSecret, sessionDays) {
	var baseStaticDir, staticDirs = {}, server;
	
	return {
		get: router.get,
		post: router.post,
		all: router.all,
		baseStatic: function(dir) { baseStaticDir = dir; },
		subStatic: function(name, dir) { staticDirs[name] = dir; },
		
		listen: function(port, host) {
			if (typeof server !== 'undefined') {
				throw new Error('Server already listening');
			}
			
			server = setup(baseStaticDir, staticDirs, sessionStore, sessionSecret, sessionDays);
			router.setupRoutes(server);
			server.listen(port, host);
			log.info('Listening on %s:%s', host || '', port);
		},
		
		close: function() {
			if (typeof server === 'undefined') {
				throw new Error('Server not listening');
			}
		
			server.close();
			server = undefined;
			log.info('Stopped listening');
		}
	};
};

