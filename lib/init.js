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
	pluginmgr = require('./pluginmgr');

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
			var db = ctx.db;
		
			// Setup webserver
			ctx.web = web.setup(basedir, db.store);
			log.info('Started web server, listening on port %s', ctx.config.web.port);
			
			// Load plugins
			pluginmgr.loadPlugins(basedir + '/plugins', ctx.web, function(err, emitter) {
				ctx.emitter = emitter;
				callback(err, ctx);
			});
		},
		
		function(ctx, callback) {
			var web = ctx.web;
					
			// Setup cursor cache routes
			web.get('/c/seek/:pos/:id', ccache.seekHandler);
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

