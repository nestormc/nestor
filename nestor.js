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
 * Entry point
 */
 
/*jslint white: true, plusplus: true */
"use strict";

var config = require('./config'),
	init = require('./lib/init.js');
	
try {
	init.startup(__dirname, config, function(e) {
		if (e) {
			console.log("Nestor startup error: " + e.message);
			process.exit();
		}
	});
} catch (e) {
	console.log("Nestor startup exception : " + e.message);
}

