/*jshint node:true */
"use strict";

var cfg = require("../../config.json"),
	log4js = require("log4js");

log4js.configure(cfg.log4js);

module.exports = cfg;