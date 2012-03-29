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
	config = require('../config').logging || {},
	slice = Array.prototype.slice,
	levels = ['debug', 'info', 'warn', 'error', 'fatal'],
	data = {
		debug: { color: 34, aliases: ['dbg'] },
		info: { color: 32, aliases: ['log', 'notice'] },
		warn: { color: 33, aliases: ['warning'] },
		error: { color: 31, aliases: ['err'] },
		fatal: { color: 30, aliases: [] }
	};
	
var levelData = {},
	currentLevel = levels.indexOf(config.level),
	currentStream = process.stdout;

// Set configuration
switch (config.type) {
	case 'stdout':
	case 'stderr':
		currentStream = process[config.type];
		break;
		
	default:
		currentStream = process.stdout;
		break;
}

// Setup levels data (aliases, colors...)
Object.keys(data).forEach(function(key) {
	var dat = data[key],
		title = key.toUpperCase();
	
	if (title.length < 5) {
		title += ' ';
	}
	
	dat.title = '\u001b[' + dat.color + 'm' + title + '\u001b[0m';
	dat.numLevel = levels.indexOf(key);
	
	dat.aliases.forEach(function(alias) {
		levelData[alias] = dat;
	});
	levelData[key] = dat;
});


/* Logger definition
	"Public" methods (all accept the same args as util.format) :
	- debug, dbg;
	- info, log, notice;
	- warning, warn;
	- error, err;
	- fatal
*/

var Logger = function(context) {
	this.context = context;
};

Logger.prototype.message = function(/* title, numLevel, format, ... */) {
	var args = slice.call(arguments),
		title = args.shift(),
		numLevel = args.shift();
		
	if (currentLevel > numLevel) {
		return;
	}
		
	currentStream.write(util.format('%s %s [%s] %s\n',
		(new Date()).toISOString(),
		title,
		this.context,
		util.format.apply(null, args)
	));
};

/* Create message aliases */
Object.keys(levelData).forEach(function(key) {
	var dat = levelData[key],
		title = dat.title,
		numLevel = dat.numLevel;
		
	Logger.prototype[key] = function(/* format, ... */) {	
		var args = slice.call(arguments);
		
		args.unshift(title, numLevel);
		this.message.apply(this, args);
	};
});
	
/* Public interface */

exports.createLogger = function(contextName) {
	return new Logger(contextName);
};

