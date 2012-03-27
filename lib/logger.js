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
 * Logger
 */

/*jslint white: true, plusplus: true */
"use strict";

var util = require('util'),
	slice = Array.prototype.slice;

var levels = ['debug', 'info', 'warn', 'error', 'fatal'],
	colors = { 'debug': 34, 'info': 32, 'warn': 33, 'error': 31, 'fatal': 30 },
	titles = {},
	currentLevel = 0,
	currentStream = process.stdout;
	
var colorize = function(color, text) {
	return '\u001b[' + color + 'm' + text + '\u001b[0m';
};

levels.forEach(function(level) {
	var t = level.toUpperCase();
	if (t.length < 5) {
		t += ' ';
	}
	titles[level] = colorize(colors[level], t);
});
	
/* Logger definition */

var Logger = function(context) {
	this.context = context;
};

Logger.prototype = {
	message: function() {
		var args = slice.call(arguments),
			level = args.shift();
			
		if (currentLevel > levels.indexOf(level)) {
			return;
		}
			
		currentStream.write(util.format('%s %s [%s] %s\n',
			(new Date()).toISOString(),
			titles[level],
			this.context,
			util.format.apply(null, args)
		));
	},
};

levels.forEach(function(lvl) {
	Logger.prototype[lvl] = function() {
		var args = slice.call(arguments);
		
		args.unshift(lvl);	
		this.message.apply(this, args);
	};
});
	
/* Public interface */

exports.setConfig = function(type, level) {
	switch (type) {
		case 'stdout':
		case 'stderr':
			currentStream = process[type];
			break;
			
		default:
			throw new Error("Unsupported logger type: " + type);
	}
	
	currentLevel = levels.indexOf(level);
	if (currentLevel === -1) {
		throw new Error("Unknown logger level: " + level);
	}
};

exports.createLogger = function(contextName) {
	return new Logger(contextName);
};

