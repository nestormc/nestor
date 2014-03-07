/*jshint node:true*/
"use strict";

var socketio = require("socket.io");
var intents = require("./intents");
var logger = require("log4js").getLogger("io");

var WATCH_FLUSH_THROTTLE = 200;


/* Allow plugins to enable watching a mongoose collection */
var watchSockets = {};
intents.on("nestor:http:watchable", function(name, Model, options) {
	watchSockets[name] = [];

	Model.schema.post("save", function(doc) {
		var data = { op: "save", doc: doc.toObject(options) };
		logger.debug("Saved " + doc._id + " in " + name);
		watchSockets[name].forEach(function(socket) {
			socket._watchPush(name, data);
		});
	});

	Model.schema.post("remove", function(doc) {
		var data = { op: "remove", doc: doc.toObject(options) };
		logger.debug("Removed " + doc._id + " in " + name);
		watchSockets[name].forEach(function(socket) {
			socket._watchPush(name, data);
		});
	});
});


function enableWatchers(socket) {
	var pending = {};
	var paused = [];
	var flushTimeout = null;


	function doFlush() {
		if (flushTimeout) {
			clearTimeout(flushTimeout);
			flushTimeout = null;
		}

		Object.keys(pending).forEach(function(collection) {
			if (paused.indexOf(collection) !== -1 || pending[collection].length === 0) {
				return;
			}

			logger.debug("Sending changes for " + collection +":\n" + pending[collection].map(function(i) { return i.op + " " + i.doc._id; }).join("\n"));
			socket.emit("watch:" + collection, pending[collection]);
			pending[collection] = [];
		});
	}

	function scheduleFlush() {
		if (!flushTimeout) {
			flushTimeout = setTimeout(doFlush, WATCH_FLUSH_THROTTLE);
		}
	}

	socket._watchPush = function(collection, data) {
		// Remove previous events on same doc
		pending[collection] = pending[collection].filter(function(item) {
			return item.doc._id !== data.doc._id;
		});

		pending[collection].push(data);
		scheduleFlush();
	};


	socket.on("disconnect", function() {
		Object.keys(watchSockets).forEach(function(collection) {
			var sockets = watchSockets[collection];
			var idx = sockets.indexOf(socket);

			if (idx !== -1) {
				sockets.splice(idx, 1);
			}
		});

		if (flushTimeout) {
			clearTimeout(flushTimeout);
		}

		delete socket._watchPush;
	});

	socket.on("watch:start", function(collection) {
		logger.debug("Start watching " + collection);
		if (collection in watchSockets && watchSockets[collection].indexOf(collection) === -1) {
			watchSockets[collection].push(socket);
			pending[collection] = [];
		}
	});

	socket.on("watch:pause", function(collection) {
		logger.debug("Pause watching " + collection);
		if (collection in watchSockets &&
			watchSockets[collection].indexOf(socket) !== -1 &&
			paused.indexOf(collection) === -1) {
			paused.push(collection);
		}
	});

	socket.on("watch:resume", function(collection) {
		logger.debug("Resume watching " + collection);
		if (collection in watchSockets &&
			watchSockets[collection].indexOf(socket) !== -1 &&
			paused.indexOf(collection) !== -1) {

			paused.splice(paused.indexOf(collection), 1);
			doFlush();
		}
	});

	socket.on("watch:stop", function(collection) {
		logger.debug("Stop watching " + collection);
		if (collection in watchSockets) {
			var sockets = watchSockets[collection];
			var index = sockets.indexOf(socket);

			if (index !== -1) {
				sockets.splice(index, 1);
				delete pending[collection];

				var pindex = paused.indexOf(collection);
				if (pindex !== -1) {
					paused.splice(pindex, 1);
				}
			}
		}
	});
}


exports.listen = function(server) {
	var io = socketio.listen(server);
	io.enable("browser client minification");
	io.enable("browser client etag");
	io.enable("browser client gzip");

	io.on("connection", function(socket) {
		enableWatchers(socket);
	});
};
