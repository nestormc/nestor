/*jshint node:true */
'use strict';

var fs = require('fs'),
	mongoose = require('mongoose'),
	path = require('path'),
	when = require('when'),
	ncall = require('when/node/function').call;
	

exports.init = function(nestor) {
	var walkDirectory, statFSItem,
		WatchedDirSchema, WatchedDir;
		
	WatchedDirSchema = new mongoose.Schema(
		{ path: { type: String, unique: true } },
		{ versionKey: false }
	);

	WatchedDirSchema.pre('save', function(next) {
		walkDirectory(this.path).then(function() { next(); });
	});

	WatchedDir = mongoose.model('watcheddir', WatchedDirSchema);
	
	statFSItem = function(path) {
		return ncall(fs.stat, path)
		.then(function(stat) {
			if (stat.isDirectory()) {
				return walkDirectory(path);
			} else {
				nestor.intents.dispatch('media.analyzeFile', { path: path });
				return when.resolve();
			}
		})
		.otherwise(function(err) {
			nestor.logger.error("Could not stat %s: %s", path, err.message);
			return when.resolve();
		});
	};
	
	walkDirectory = function(dir) {
		nestor.logger.debug("Walking directory %s", dir);
		
		return ncall(fs.readdir, dir)
		.then(function(files) {
			return when.map(files, function(file) {
				return statFSItem(path.join(dir, file));
			});
		})
		.otherwise(function(err) {
			nestor.logger.error("Could not read directory %s: %s", dir, err.message);
			return when.resolve();
		});
	};

	
	nestor.server.mongooseResource('watcheddirs', WatchedDir);
	
	// On startup: re-walk watched directories 
	nestor.intents.register('nestor.startup', function(args, next) {
		WatchedDir.find({}, function(err, docs) {
			if (err) {
				nestor.logger.error("Cannot walk watched directories: %s", err.message);
			} else {
				docs.forEach(function(doc) {
					walkDirectory(doc.path);
				});
			}
			
			next();
		});
	});
	
	return when.resolve();
};

exports.manifest = {
	description: "Media scanning dispatcher"
};
