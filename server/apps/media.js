/*jshint node:true */
"use strict";

var fs = require("fs"),
	mongoose = require("mongoose"),
	path = require("path"),
	when = require("when"),
	guard = require("when/guard"),
	ncall = require("when/node/function").call;
	

exports.init = function(nestor) {
	var WatchedDirSchema, WatchedDir;
		
	WatchedDirSchema = new mongoose.Schema(
		{ path: { type: String, unique: true } },
		{ versionKey: false, id: false }
	);

	WatchedDirSchema.pre("save", function(next) {
		walkDirectory(this.path).then(function() { next(); });
	});

	WatchedDir = mongoose.model("watcheddir", WatchedDirSchema);
	
	function statFSItem(path) {
		return ncall(fs.stat, path)
		.then(function(stat) {
			if (stat.isDirectory()) {
				return walkDirectory(path);
			} else {
				nestor.intents.dispatch("media.analyzeFile", { path: path });
				return when.resolve();
			}
		})
		.otherwise(function(err) {
			nestor.logger.error("Could not stat %s: %s", path, err.message);
			return when.resolve();
		});
	}
	
	function walkDirectory(dir) {
		nestor.logger.debug("Walking directory %s", dir);

		// Create guarded handler to avoid opening too many files at once
		var guarded = guard(guard.n(128), function(file) {
			return statFSItem(path.join(dir, file));
		});
		
		return ncall(fs.readdir, dir)
		.then(function(files) {
			return when.map(files, guarded);
		})
		.otherwise(function(err) {
			nestor.logger.error("Could not read directory %s: %s", dir, err.message);
			return when.resolve();
		});
	}

	
	nestor.rest.mongooseResource("watchedDirs", WatchedDir);
	
	// On startup: re-walk watched directories 
	nestor.intents.register("nestor.startup", function(args, next) {
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
