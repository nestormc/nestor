/*jshint node:true */
"use strict";

var intents = require("./intents");
var config = require("./config").scheduler;

var when = require("when");
var timeout = require("when/timeout");
var logger = require("log4js").getLogger("scheduler");
var spawn = require("child_process").spawn;
var FfmpegCommand = require("fluent-ffmpeg");

var maxJobs = (config || {}).maxJobs || 1;
var jobTimeout = (config || {}).jobTimeout || 10000;

var queue = [];
var processing = 0;

var processors = {
	"mimetype": function(data) {
		var path = data.path;
		var callback = data.callback;
		var mime = "";
		var child;

		try {
			child = spawn("file", ["--brief", "--mime-type", path]);
		} catch(e) {
			callback(e);
			return when.resolve();
		}

		var d = when.defer();

		child.stdout.on("data", function(data) {
			mime += data.toString();
		});

		child.stdout.on("error", function(err) {
			callback(err);
			d.resolve();
		});

		child.stdout.on("end", function() {
			callback(null, path, mime.trim("\n"));
			d.resolve();
		});

		return d.promise;
	},

	"ffprobe": function(data) {
		var path = data.path;
		var callback = data.callback;
		var d = when.defer();

		FfmpegCommand.ffprobe(path, function(err, data) {
			if (err) {
				d.resolve();
				return callback(err);
			}

			data.streams = data.streams || [];
			data.format = data.format || {};
			data.tags = data.format.tags || {};

			d.resolve();
			callback(null, path, data);
		});

		return d.promise;
	}
};


function jobDesc(op) {
	var desc = op.op;

	if (typeof op.data === "string") {
		desc += " " + op.data;
	} else if ("path" in op.data) {
		desc += " " + op.data.path;
	}

	return desc;
}

function enqueue(op) {
	logger.debug("Enqueue %j", jobDesc(op));
	queue.push(op);

	if (processing === 0) {
		logger.debug("Start processing queue");
	}

	run();
}

function runJob(op) {
	logger.debug("Dequeue %j", jobDesc(op));
	var promise = processOperation(op);

	timeout(jobTimeout, promise).otherwise(function() {
		logger.warn("Job did not finish after %s seconds: %j", jobTimeout/1000, jobDesc(op));

		promise._gotTimeout = true;
		processing--;

		// Run next job anyway, or all scheduled jobs will stall
		run();
	});

	promise.then(function() {
		if (promise._gotTimeout) {
			logger.warn("Job finished after timeout: %j", jobDesc(op));
		} else {
			logger.debug("Finished %j", jobDesc(op));
			processing--;
		}

		run();
	}).otherwise(function(err) {
		logger.error("Job error processing %j:\n%s", jobDesc(op), err.stack);
		processing--;

		run();
	});
}

function run() {
	while (queue.length && processing < maxJobs) {
		processing++;
		runJob(queue.shift());
	}
}

function processOperation(item) {
	if (item.op in processors) {
		try {
			return processors[item.op](item.data);
		} catch(err) {
			logger.error("Error processing %s:\n%s", item.op, err.stack);
			return when.resolve();
		}
	} else {
		logger.warn("No processor for queued operation '%s'", item.op);
		return when.resolve();
	}
}

intents.on("nestor:scheduler:register", function(operation, processor) {
	processors[operation] = processor;
});

intents.on("nestor:scheduler:enqueue", function(operation, data) {
	enqueue({ op: operation, data: data });
});
