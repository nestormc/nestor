/*jshint node:true */
'use strict';

var argv = require('optimist').argv,
	mongo = require('mongodb'),
	mongoose = require('mongoose'),
	
	uri = argv.database || 'mongodb://localhost/nestor',
	db;

exports.isConnected = function() {
	return !!db;
};

exports.connect = function(callback) {
	if (db) {
		return callback(new Error("Already connected"));
	}
	
	mongo.Db.connect(uri, { noOpen: false }, function(err, connection) {
		if (err) {
			return callback(err);
		}
		
		mongoose.connect(uri, function(err) {
			if (!err) {
				db = connection;
			}
			
			callback(err);
		});
	});
};