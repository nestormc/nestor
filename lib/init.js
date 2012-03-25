/*jslint white: true, plusplus: true */
"use strict";

var async = require('async'),
	web = require('./web'),
	logger = require('./logger'),
	log = logger.createLogger('init'),
	pluginmgr = require('./pluginmgr');

exports.startup = function(basedir, config, callback) {
	async.waterfall([
		// Initialize logger
		function(callback) {
			try {
				logger.setConfig(config.logging.type, config.logging.level);
				callback(null);
			}
			catch(e) {
				callback(e);
			}
		},
		
		// Initialize DB
		function(callback) {
			var ctx = { config: config };
		
			require('./db').connect(ctx.config.db, function(e, db) {
				ctx.db = db;
				callback(e, ctx);
			});
		},
	
		// Setup Webserver
		function(ctx, callback) {
			var db = ctx.db;
		
			ctx.web = web.setup(ctx.config, db.store, db.users);
			log.info('Started web server, listening on port %s', ctx.config.web.port);
			
			callback(null, ctx);
		},
		
		// Load plugins 
		function(ctx, callback) {
			pluginmgr.loadPlugins(basedir + '/plugins', ctx.web, function(err, emitter) {
				ctx.emitter = emitter;
				callback(err, ctx);
			});
		},
		
		// Setup events
		function(ctx, callback) {
			process.on('SIGINT', function() {
				log.info('Caught SIGINT, exiting');
				
				ctx.emitter.emit('exit');
				ctx.web.close();
				
				process.exit();
			});
		}
	], callback);
};

