/*jshint node:true */
"use strict";

var intents = require("./intents");

var when = require("when");
var timeout = require("when/timeout");
var logger = require("log4js").getLogger("scheduler");

var queue = [];
var processing = false;
var processors = {};

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
	
	if (!processing) {
		logger.debug("Start processing queue");
		run();
	}
}

function run() {
	processing = true;
	var op = queue.shift();

	if (op) {
		logger.debug("Dequeue %j", jobDesc(op));

		var promise = processOperation(op);

		timeout(10000, promise).otherwise(function() {
			logger.warn("Job did not finish after 10 seconds: %j", jobDesc(op));

			// Run next job anyway, or all scheduled jobs will stall
			run();
		});

		promise.then(function() {
			logger.debug("Finished %j", jobDesc(op));
			run();
		});
	} else {
		logger.debug("Finished processing queue");
		logger.info("Processing queue drained");
		processing = false;
	}
}

function processOperation(item) {
	if (item.op in processors) {
		return processors[item.op](item.data);
	} else {
		logger.error("No processor for queued operation '%s'", item.op);
		return when.resolve();
	}
}

intents.on("nestor:scheduler:register", function(operation, processor) {
	processors[operation] = processor;
});

intents.on("nestor:scheduler:enqueue", function(operation, data) {
	enqueue({ op: operation, data: data });
});
