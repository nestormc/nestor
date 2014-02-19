/*jshint node:true */
"use strict";

var log4js = require("log4js"),
	argv = require("optimist").argv;

var cfg = require(argv.config || "../config.json");

log4js.configure(cfg.log4js);

module.exports = cfg;