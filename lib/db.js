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
 * Database connection and initialization
 */

/*jslint white: true, plusplus: true */
"use strict";

var async = require('async'),
	util = require('util'),
	mongo = require('mongodb'),
	MongoStore = require('connect-mongodb'),
	mongoose = require('mongoose'),
	misc = require('./misc');
	

/* Connect to database */
exports.connect = function (mongoURI, callback) {
	async.waterfall([
		// Setup and open database
		function(callback) {
			mongo.Db.connect(mongoURI, { noOpen: false }, function(err, db) {
				mongoose.connect(mongoURI);
				callback(err, { db: db });
			});
		},
		
		// Create session store 
		function(context, callback) {
			context.store = new MongoStore({ db: context.db });
			callback(null, context);
		}
	], function(err, context) {
		if (err) {
			callback(err);
		} else {
			// Return public interface
			/* context.collection = function(collname, callback) {
				context.db.collection(collname, callback);
			};*/
			
			callback(null, context);
		}
	});
};

