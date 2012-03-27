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

