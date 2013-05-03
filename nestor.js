#!/usr/bin/env node

/*jshint node:true */
'use strict';

var mongoose = require('mongoose'),
	ncall = require('when/node/function').call,

	acl = require('./modules/acl'),
	apploader = require('./modules/apploader'),
	config = require('./modules/config'),
	intents = require('./modules/intents'),
	server = require('./modules/server');

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
