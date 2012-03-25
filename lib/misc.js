/*jslint white: true, plusplus: true */
"use strict";

var async = require('async'),
	crypto = require('crypto');

exports.uid = function(len) {
	return crypto.randomBytes(Math.ceil(len * 0.75)).toString('base64').slice(0, len);
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

