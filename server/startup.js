/*jshint node:true */
"use strict";

var argv = require("optimist").argv;

if (argv.daemon) {
	require("daemon")();
}

var mongoose = require("mongoose"),
	ncall = require("when/node/function").call,
	logger = require("log4js").getLogger("nestor"),

	config = require("./modules/config"),
	intents = require("./modules/intents"),
	plugins = require("./modules/plugins");

require("./modules/server");
require("./modules/scheduler");

module.exports = function startup() {
	process.on("error", function(err) {
		logger.fatal(err.message + "\n" + err.stack);
		process.exit(1);
	});

	logger.info("Starting nestor");

	ncall(function(cb) {
		mongoose.connect(config.database, cb);
	})
	.then(plugins)
	.then(function() {
		intents.emit("nestor:startup");
	})
	.otherwise(function(err) {
		logger.fatal(err.message + "\n" + err.stack);
		process.exit(1);
	});
};
