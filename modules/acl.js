/*jshint node:true */
"use strict";

var crypto = require("crypto"),

	config = require("./config").acl,
	logger = require("./logger").createLogger("acl"),
	server = require("./server"),
	
	adminEnabled, adminPassword;


exports.init = function() {
	adminEnabled = config.admin.enabled;
	adminPassword = config.admin.password;
	
	if (!adminPassword) {
		adminPassword = crypto.randomBytes(6).toString("hex");
		
		logger.notice("admin password is %s %s %s %s",
			adminPassword.substr(0, 3),
			adminPassword.substr(3, 3),
			adminPassword.substr(6, 3),
			adminPassword.substr(9, 3)
		);
	}
	
	server.authHandler(
		function authUser(host, salt, user, passSalted, callback) {
			var adminKey = crypto.createHmac("sha1", salt).update(adminPassword).digest("hex");
			
			if (adminEnabled &&	user === "admin" &&	passSalted === adminKey) {
				logger.notice("Admin login from %s", host);
				callback(null, true);
			} else {
				callback(null, false);
			}
		}
	);
};

