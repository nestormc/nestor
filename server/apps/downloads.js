/*jshint node:true */
"use strict";

var when = require("when");

exports.init = function(nestor) {
	return when.resolve();
};

exports.manifest = {
	description: "Downloads",
	clientApps: [ "downloads" ]
};
