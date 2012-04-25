/*
 * Copyright 2010-2012 Nicolas Joyard
 *
 * This file is part of nestor.
 *
 * nestor is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * nestor is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with nestor.  If not, see <http://www.gnu.org/licenses/>.
 */

/**
 * Initialization routine
 */

/*jslint white: true, plusplus: true */
"use strict";

var async = require('async'),
	web = require('./web'),
	ccache = require('./ccache'),
	logger = require('./logger'),
	log = logger.createLogger('init'),
	pluginmgr = require('./pluginmgr'),
	acl = require('./acl');

exports.startup = function(basedir, config, callback) {
	async.waterfall([
		// Initialize DB
		function(callback) {
			var ctx = { config: config };
		
			require('./db').connect(ctx.config.db, function(e, db) {
				ctx.db = db;
				callback(e, ctx);
			});
		},
		
		function(ctx, callback) {
			var db = ctx.db,
				wconf = ctx.config.web;
		
			// Setup webserver
			ctx.web = web.setup(db.store, wconf.session.secret, wconf.session.days);
			
			// Setup static files
			ctx.web.baseStatic(basedir + '/static');
			
			// Load plugins
			pluginmgr.loadPlugins(basedir + '/plugins', ctx.web, function(err, emitter) {
				ctx.emitter = emitter;
				callback(err, ctx);
			});
		},
		
		function(ctx, callback) {
			
			// Setup plugin manager routes
			ctx.web.get('/plugins/statics', function(req, res, next) {
				try {
					res.setHeader('Content-Type', 'application/json');
					res.end(JSON.stringify(pluginmgr.statics));
				} catch(e) {
					next(e);
				}
			});
					
			// Setup cursor cache routes
			ctx.web.get('/cursor/:id/seek/:pos', ccache.seekHandler);
			ctx.web.get('/cursor/:id/discard', ccache.discardHandler);
			ctx.web.get('/cursor/:id', ccache.getHandler);
			
			// Setup ACL routes
			ctx.web.get('/acl', acl.rightsHandler);
		
			// Setup events
			process.on('SIGINT', function() {
				log.info('Caught SIGINT, exiting');
				
				ctx.emitter.emit('exit');
				ctx.web.close();
				
				process.exit();
			});
			
			ctx.web.listen(ctx.config.web.port);
			
			log.info('Nestor startup complete');
			callback(null, ctx);
		}
	], callback);
};

