/*jshint node:true*/
"use strict";

var intents = require("./intents");


/* Throttle work to run at most once every interval milliseconds.
 *
 * Calling the returned function schedules work to run interval ms later;
 * every other call in the meantime is ignored.
 *
 * The returned function also has two helper methods:
 * - force(): runs work immediately, canceling any scheduled run
 * - cancel(): cancels any scheduled run
 */
exports.throttled = function throttle(work, interval) {
	var timeout = null;

	function cancel() {
		if (timeout) {
			clearTimeout(timeout);
			timeout = null;
		}
	}

	function run() {
		cancel();
		work();
	}

	function throttled() {
		if (!timeout) {
			timeout = setTimeout(run, interval);
		}
	}

	throttled.force = run;
	throttled.cancel = cancel;

	return throttled;
};



function ucFirst(str) {
	return str.charAt(0).toUpperCase() + str.slice(1);
}

var noCap = /^(a|an|and|in|of|the|les?|qu(e|o?i)|mais|pas|ni|car|donc|c|es?t|o(u|ù)|la|une?|des?|(m|t|s)(on|a|es))$/;
exports.titleCase = function(str) {
	return ucFirst(str.toLowerCase().replace(/\b(\w+)\b/g, function(m, word) {
		return word.match(noCap) ? word : ucFirst(word);
	}));
};


exports.mimetype = function(path, callback) {
	intents.emit("nestor:scheduler:enqueue", "mimetype", {
		path: path,
		callback: callback
	});
};


exports.ffprobe = function(path, callback) {
	intents.emit("nestor:scheduler:enqueue", "ffprobe", {
		path: path,
		callback: callback
	});
};


exports.regexpEscape = function(str) {
	return str.replace(
		/([[\\\].*?+()^$])/g,
		"\\$1"
	);
};