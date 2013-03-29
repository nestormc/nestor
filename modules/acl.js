/*jshint node:true */
'use strict';

var crypto = require('crypto'),

	config = require('./config'),
	logger = require('./logger').createLogger('acl'),
	
	adminEnabled, adminPassword;

exports.init = function() {
	// TODO listen for changes of those parameters
	config.get(['acl.admin.enabled', 'acl.admin.passwordInterval'], function(enabled, interval) {
		var renewPassword;
		
		adminEnabled = enabled === false ? false : true;
		interval = interval || 60;

		if (adminEnabled) {
			renewPassword = function() {
				adminPassword = crypto.randomBytes(6).toString('hex');
				
				logger.notice("New admin password is %s %s %s %s, will be renewed in %d seconds",
					adminPassword.substr(0, 3),
					adminPassword.substr(3, 3),
					adminPassword.substr(6, 3),
					adminPassword.substr(9, 3),
					interval
				);
				
				setTimeout(renewPassword, interval * 1000);
			};
			
			renewPassword();
		} else {
			logger.notice("Admin login is disabled");
		}
	});
};

