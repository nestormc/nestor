/*jslint white: true, plusplus: true */
"use strict";

var async = require('async'),
	web = require('./web'),
	ccache = require('./ccache'),
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
		
		function(ctx, callback) {
			var db = ctx.db;
		
			// Setup webserver
			ctx.web = web.setup(basedir, ctx.config, db.store, db.users);
			log.info('Started web server, listening on port %s', ctx.config.web.port);
			
			// Load plugins
			pluginmgr.loadPlugins(basedir + '/plugins', ctx.web, function(err, emitter) {
				ctx.emitter = emitter;
				callback(err, ctx);
			});
		},
		
		function(ctx, callback) {
			var web = ctx.web;
					
			// Setup cursor cache
			web.get('/c/discard/:id', ccache.discardHandler);
			web.get('/c/:id', ccache.getHandler);
		
			// Setup events
			process.on('SIGINT', function() {
				log.info('Caught SIGINT, exiting');
				
				ctx.emitter.emit('exit');
				web.close();
				
				process.exit();
			});
			
			log.info('Nestor startup complete');
			callback(null, ctx);
		}
	], callback);
};

