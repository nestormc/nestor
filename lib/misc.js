/*
 * Miscellaneous helpers
 */
 
/*jslint white: true, plusplus: true */
"use strict";

var async = require('async'),
	crypto = require('crypto');

exports.uid = function(len, useHex) {
	return crypto.randomBytes(len).toString(useHex ? 'hex' : 'base64');
};

exports.md5 = function(data) {
	return crypto.createHash('md5').update(data).digest('hex');
};

/* Run task(key, value, callback) in parallel for every property in obj */
exports.objParallel = function(obj, task, callback) {
	var tasks = Object.keys(obj).map(function(key) {
		var value = obj[key];
		return function(callback) {
			task(key, value, callback);
		}; 
	});
	
	async.parallel(tasks, callback);
};

