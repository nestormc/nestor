/*jslint white: true, plusplus: true */
"use strict";

var config = require('./config'),
	init = require('./lib/init.js');
	
try {
	init.startup(__dirname, config, function(e) {
		if (e) {
			console.log("Nestor startup error: " + e.message);
			process.exit();
		}
	});
} catch (e) {
	console.log("Nestor startup exception : " + e.message);
}

