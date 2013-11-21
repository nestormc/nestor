/*jshint node:true */
"use strict";

var argv = require("optimist").argv;

if (argv.daemon) {
	require("daemon")();
}

var mongoose = require("mongoose"),
	ncall = require("when/node/function").call,
	logger = require("log4js").getLogger("nestor"),

	apploader = require("./modules/apploader"),
	config = require("./modules/config"),
	intents = require("./modules/intents"),
	server = require("./modules/server"),
	share = require("./modules/share");


module.exports = function startup() {
	process.on("error", function(err) {
		logger.fatal(err.message + "\n" + err.stack);
		process.exit(1);
	});

	ncall(function(cb) {
		mongoose.connect(config.database, cb);
	})
	.then(apploader.init.bind(null, __dirname))
	.then(share.init)
	.then(server.init)
	.then(function() {
		intents.dispatch("nestor.startup");
	})
	.otherwise(function(err) {
		logger.fatal(err.message + "\n" + err.stack);
		process.exit(1);
	});
};
