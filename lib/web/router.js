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
 * Web router
 */

/*jslint white: true, plusplus: true */
"use strict";

var slice = Array.prototype.slice,
	routes = [],
	addRoute;

addRoute = function() {
	if (typeof routes === 'undefined') {
		throw new Error("Cannot add routes anymore");
	}

	routes.push(slice.call(arguments));
};

exports.get = addRoute.bind(null, 'get');
exports.post = addRoute.bind(null, 'post');
exports.all = addRoute.bind(null, 'all');

exports.setupRoutes = function(server) {
	// Setup custom routes in the order they were defined
	routes.forEach(function(args) {
		var method = args.shift();
		server[method].apply(server, args);
	});
	
	// Catchall 404 handler
	server.all('*', function(req, res, next) {
		res.writeHead(404, 'Not found');
		res.end();
	});
	
	// Make addRoute throw an error from now on
	routes = undefined;
};

