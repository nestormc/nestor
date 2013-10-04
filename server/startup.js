/*jshint node:true */
'use strict';

var mongoose = require('mongoose'),
	ncall = require('when/node/function').call,

	acl = require('./modules/acl'),
	apploader = require('./modules/apploader'),
	config = require('./modules/config'),
	intents = require('./modules/intents'),
	logger = require('./modules/logger'),
	server = require('./modules/server');

module.exports = function startup() {
	logger.logo();

	ncall(function(cb) {
		mongoose.connect(config.database, cb);
	})
	.then(apploader.init.bind(null, __dirname))
	.then(acl.init)
	.then(server.init)
	.then(function() {
		intents.dispatch("nestor.startup");
	})
	.otherwise(function(err) {
		console.log(err.message + "\n" + err.stack);
		process.exit(1);
	});

	process.on('error', function(err) {
		console.log(err.message + "\n" + err.stack);
		process.exit(1);
	});
};
