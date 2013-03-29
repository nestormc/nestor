/*jshint node:true */
'use strict';

var async = require('async'),
	mongoose = require('mongoose'),
	events = require('events'),
	util = require('util'),
	
	ConfigItem, config;

	
ConfigItem = mongoose.model('config', new mongoose.Schema({
	key: { type: String, unique: true },
	value: String
}));

config = new events.EventEmitter();

/* Return all configuration items */
config.list = function(callback) {
	ConfigItem.find({}).select('key value').exec(callback);
};

/* Get configuration value(s) */
config.get = function(keys, callback) {
	var getValue, processResult;
	
	getValue = function(key, cb) {
		ConfigItem.findOne({ key: key }).select('value').exec(
			function(err, item) {
				cb(err, item ? item.value : null);
			}
		);
	};
	
	processResult = function(err, values) {
		if (err) {
			callback();
		} else {
			callback.apply(null, util.isArray(values) ? values : [values]);
		}
	};
	
	if (util.isArray(keys)) {
		async.map(keys, getValue, processResult);
	} else {
		getValue(keys, processResult);
	}
};

/* Set configuration values */
config.set = function(values, callback) {
	async.each(
		Object.keys(values),
		function(key, cb) {
			ConfigItem.findOneAndUpdate(
				{ key: key },
				{ value: values[key] },
				{ upsert: true },
				function(err) {
					if (!err) {
						config.emit(key, values[key]);
					}
					
					cb(err);
				}
			);
		},
		callback
	);
};

/* get() and on() with the same callback */
config.watch = function(key, callback) {
	config.get(key, callback);
	config.on(key, callback);
};


/* List options on the console and exit */
config.doList = function() {
	config.list(function(err, data) {
		if (err) {
			console.log("Could not read configuration: " + err.message);
			process.exit(1);
		}
		
		console.log("Configuration values:");
		data.forEach(function(item) {
			console.log("    " + item.key + " = " + item.value);
		});
		
		process.exit(0);
	});
};


/* Set options from command line and exit */
config.doSet = function(arg) {
	var set = util.isArray(arg) ? arg : [arg],
		values = {};
		
	set.forEach(function(item) {
		var parts = item.split('=');
		values[parts[0]] = parts[1];
	});
	
	config.set(values, function(err) {
		if (err) {
			logger.fatal("Could not write configuration: " + err.message);
			process.exit(1);
		}
		
		process.exit(0);
	});
};


module.exports = config;
