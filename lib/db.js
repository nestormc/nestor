/*
 * Database connection and initialization
 */
 
/*jslint white: true, plusplus: true */
"use strict";

var async = require('async'),
	util = require('util'),
	mongo = require('mongodb'),
	MongoStore = require('connect-mongodb'),
	mongoose = require('mongoose'),
	misc = require('./misc'),
	preloadCollections = [ 'users' ];
	

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
		
		// Create session store and preload collections
		function(context, callback) {
			context.store = new MongoStore({ db: context.db });
			
			async.forEach(preloadCollections, function(collname, cb) {
				context.db.collection(collname, function(err, collection) {
					context[collname] = collection;
					cb(err, context);
				});
			}, function(err) {
				callback(err, context);	
			});
		}
	], function(err, context) {
		if (err) {
			callback(err);
		} else {
			// Return public interface
			context.collection = function(collname, callback) {
				context.db.collection(collname, callback);
			};
			
			callback(null, context);
		}
	});
};

