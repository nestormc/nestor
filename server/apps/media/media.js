/*jshint node:true */
"use strict";

var fs = require("fs"),
	ffprobe = require("node-ffprobe"),
	mongoose = require("mongoose"),
	path = require("path"),
	when = require("when"),
	guard = require("when/guard"),
	spawn = require("child_process").spawn,

	cover = require("./cover");
	

function getWalker(nestor) {
	function dispatchIntent(path, mimetype, metadata) {
		nestor.logger.debug("Dispatching intent for %s", path);

		var d = when.defer();
		nestor.intents.dispatch("media.analyzeFile", { path: path, mime: mimetype, meta: metadata }, function() {
			d.resolve();
		});

		return d.promise;
	}


	function probeFile(path, mime) {
		nestor.logger.debug("Probe %s", path);

		var d = when.defer();

		try {
			ffprobe(path, function(err, metadata) {
				if (err) {
					nestor.logger.error("Cannot ffprobe %s: %s", path, err.message);
					d.resolve();
				} else {
					d.resolve({ op: "intent", path: path, mime: mime, meta: metadata });
				}
			});
		} catch(e) {
			nestor.logger.error("Cannot ffprobe %s: %s", path, e.message);
			return when.resolved();
		}

		return d.promise;
	}

	function getFileMimetype(path) {
		nestor.logger.debug("Get mimetype for %s", path);

		var mime = "";
		var child;

		try {
			child = spawn("file", ["--brief", "--mime-type", path]);
		} catch(e) {
			nestor.logger.error("Cannot get mimetype for %s: %s", path, e.message);
			return when.resolved();
		}

		var d = when.defer();
		
		child.stdout.on("data", function(data) {
			mime += data.toString();
		});

		child.stdout.on("error", function(err) {
			nestor.logger.error("Cannot get mimetype for %s: %s", path, err.message);
			d.resolve();
		});

		child.stdout.on("end", function() {
			nestor.logger.debug("Got mimetype %s for %s", mime.trim("\n"), path);
			d.resolve({ op: "probe", path: path, mime: mime.trim("\n") });
		});

		return d.promise;
	}

	
	function statFSItem(path) {
		nestor.logger.debug("Stat item %s", path);

		var d = when.defer();

		fs.stat(path, function(err, stat) {
			if (err) {
				nestor.logger.error("Could not stat %s: %s", path, err.message);
				d.resolve();
			} else {
				if (stat.isDirectory()) {
					d.resolve({ op: "walk", path: path });
				} else {
					d.resolve({ op: "mime", path: path });
				}
			}
		});

		return d.promise;
	}
	

	function walkDirectory(dir) {
		nestor.logger.debug("Walking directory %s", dir);

		var d = when.defer();

		fs.readdir(dir, function(err, files) {
			var ops = [];

			if (err) {
				nestor.logger.error("Could not read directory %s: %s", dir, err.message);
			} else {
				files.forEach(function(file) {
					ops.push({ op: "stat", path: path.join(dir, file) });
				});
			}

			d.resolve(ops);
		});

		return d.promise;
	}


	function processOperation(item) {
		switch(item.op) {
			case "walk": return walkDirectory(item.path);
			case "stat": return statFSItem(item.path);
			case "mime": return getFileMimetype(item.path);
			case "probe": return probeFile(item.path, item.mime);
			case "intent": return dispatchIntent(item.path, item.mime, item.meta);
			default:
				nestor.logger.error("Unknown queued operation '%s'", item.op);
				return when.resolved();
		}
	}


	var run = guard(guard.n(nestor.config.media.walkJobs || 1), function(item) {
		var promise = processOperation(item);

		return promise.then(function(next) {
			if (next) {
				if (!Array.isArray(next)) {
					next = [next];
				}

				next.forEach(run);
			}
		});
	});


	return function(dirpath) {
		run({ op: "walk", path: dirpath });
	};
}


exports.init = function(nestor) {
	var walk = getWalker(nestor);
		
	var WatchedDirSchema = new mongoose.Schema(
		{ path: { type: String, unique: true } },
		{ versionKey: false, id: false }
	);

	WatchedDirSchema.pre("save", function(next) {
		walk(this.path);
		next();
	});

	var WatchedDir = mongoose.model("watcheddir", WatchedDirSchema);

	nestor.rest.mongooseResource("watchedDirs", WatchedDir);

	cover.restSetup(nestor.rest);

	nestor.auth.declareRights([
		{
			name: "watched-dirs",
			route: "/watchedDirs*",
			description: "Edit watched media directories"
		}
	]);
	
	// On startup: re-walk watched directories 
	nestor.intents.register("nestor.startup", function(args, next) {
		WatchedDir.find({}, function(err, docs) {
			if (err) {
				nestor.logger.error("Cannot walk watched directories: %s", err.message);
			} else {
				docs.forEach(function(doc) {
					walk(doc.path);
				});
			}
			
			next();
		});
	});

	// Register cover fetcher
	nestor.intents.register("media.fetchCover", function(args, next) {
		cover.findCover(nestor.logger, args.key, args.hints);
		next(false);
	});

	return when.resolve();
};

exports.manifest = {
	description: "Media scanning dispatcher"
};
