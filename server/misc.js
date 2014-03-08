/*jshint node:true*/
"use strict";


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
