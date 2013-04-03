/*jshint node: true, es5: true */
"use strict";

var util = require('util'),
	
	slice = [].slice,
	levels = ['debug', 'info', 'warn', 'error', 'notice', 'fatal'],
	data = {
		debug: { color: "34", aliases: ['dbg'] },
		info: { color: "32", aliases: ['log'] },
		warn: { color: "33", aliases: ['warning'] },
		error: { color: "31", aliases: ['err'] },
		notice: { color: "01;32", aliases: ['important'] },
		fatal: { color: "01;31", aliases: [] }
	},
	levelData = {},
	
	currentLevel = 'debug',
	currentStream = process.stdout;


// Setup level data (aliases, colors...)
Object.keys(data).forEach(function(key) {
	var dat = data[key],
		title = key.toUpperCase();
	
	while (title.length < 6) {
		title += ' ';
	}
	
	dat.title = '\u001b[' + dat.color + 'm' + title + '\u001b[0m';
	dat.ttitle = title;
	dat.numLevel = levels.indexOf(key);
	
	dat.aliases.forEach(function(alias) {
		levelData[alias] = dat;
	});
	levelData[key] = dat;
});


/* Logger definition
	"Public" methods (all of them accept the same args as util.format) :
	- debug, dbg;
	- info, log;
	- warning, warn;
	- error, err;
	- notice, important;
	- fatal
*/

var Logger = function(context) {
	this.context = context;
};

Logger.prototype._message = function(/* title, ttitle, numLevel, format, ... */) {
	var args = slice.call(arguments),
		title = args.shift(),
		ttitle = args.shift(),
		numLevel = args.shift();
	
	if (currentLevel > numLevel) {
		return;
	}
		
	currentStream.write(util.format('%s %s [%s] %s\n',
		(new Date()).toISOString(),
		currentStream.isTTY ? title : ttitle,
		this.context,
		util.format.apply(null, args)
	));
};

/* Create message aliases */
Object.keys(levelData).forEach(function(key) {
	var dat = levelData[key],
		title = dat.title,
		ttitle = dat.ttitle,
		numLevel = dat.numLevel;
		
	Logger.prototype[key] = function(/* format, ... */) {	
		var args = slice.call(arguments);
		
		args.unshift(title, ttitle, numLevel);
		this._message.apply(this, args);
		
		if (key === "fatal") {
			process.exit(1);
		}
	};
});
	
/* Public interface */
Logger.prototype.createLogger = function(contextName) {
	return new Logger(contextName);
};

module.exports = new Logger('nestor');
