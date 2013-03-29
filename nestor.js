/*jshint node:true */
'use strict';

var argv = require('optimist').argv,

	acl = require('./modules/acl'),
	apploader = require('./modules/apploader'),
	config = require('./modules/config'),
	database = require('./modules/database'),
	intents = require('./modules/intents'),
	logger = require('./modules/logger'),
	server = require('./modules/server');


if (argv.help) {
	console.log(
		"Command line options :\n" + 
		"    --database URI    set database URI, defaults to 'http://localhost/nestor'\n" +
		"    --list            list configuration keys and values\n" +
		"    --set KEY=VALUE   set configuration KEY to VALUE; can be specified multiple times\n"
	);
	
	process.exit(0);
}


database.connect(function(err) {
	if (err) {
		logger.fatal("Could not connect to database: %s", err.message);
	}
	
	logger.info("Connected to database");
	startup();
});


function startup() {
	if (argv.list) {
		config.doList();
	} else if (argv.set) {
		config.doSet(argv.set);
	} else {
		apploader(__dirname, function(err) {
			if (err) {
				logger.fatal(err.message);
			} else {
				logger.info("Finished loading apps");
				intents.dispatch("nestor.startup", null, function() {});
				
				acl.init();
				server.init();
			}
		});
	}
}
