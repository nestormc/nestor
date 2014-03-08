/*jshint node:true*/
"use strict";

var socketio = require("socket.io");
var intents = require("./intents");
var misc = require("./misc");
var logger = require("log4js").getLogger("io");

var WATCH_FLUSH_THROTTLE = 200;


/* Compare two documents according to a mongodb sort operator */
function compareDocs(sort, docA, docB) {
	var fields = Object.keys(sort);
	var field, left, right;

	for (var i = 0, len = fields.length; i < len; i++) {
		field = fields[i];

		if (sort[field] > 0) {
			left = docA; right = docB;
		} else {
			right = docA; left = docB;
		}

		if (left[field] < right[field]) {
			return -1;
		} else if (left[field] > right[field]) {
			return 1;
		}
	}

	return 0;
}


/* Build a mongodb query operator that matches all docs after doc according to sort operator */
function getAfterDocOperator(sort, doc) {
	var operator = { $or: [] };
	var current = operator.$or;
	var previous;
	var op;

	Object.keys(sort).forEach(function(field) {
		if (previous) {
			op = { $and: [] };
			current.push(op);
			current = op.$and;

			op = {};
			op[previous] = doc[previous];
			current.push(op);

			op = { $or: [] };
			current.push(op);
			current = op.$or;
		}

		op = {};
		if (sort[field] > 0) {
			op[field] = { $gt: doc[field] };
		} else {
			op[field] = { $lt: doc[field] };
		}

		current.push(op);

		previous = field;
	});

	return operator;
}


/* Allow plugins to enable watching a mongoose collection */
var watchables = {};
intents.on("nestor:http:watchable", function(name, Model, options) {
	options = options || {};

	watchables[name] = {
		sockets: [],
		sort: options.sort,
		model: Model,
		toObject: options.toObject
	};

	Model.schema.post("save", function(doc) {
		var data = { op: "save", doc: doc.toObject(options.toObject) };

		// Push change to every socket watching this collection
		watchables[name].sockets.forEach(function(socket) {
			socket._watchPush(name, data);
		});
	});

	Model.schema.post("remove", function(doc) {
		var data = { op: "remove", doc: doc.toObject(options.toObject) };

		// Push change to every socket watching this collection
		watchables[name].sockets.forEach(function(socket) {
			socket._watchPush(name, data);
		});
	});
});


/* Enable collection watching for a socket, called on socket connection */
function enableWatchers(socket) {
	// Lists of pending changes for each collection
	var pending = {};

	// Last fetched document for each collection
	var lastFetched = {};

	// List of fully fetched collection names
	var fullyFetched = [];

	// List of paused collections
	var paused = [];

	// Reset fetched status for a collection
	function resetFetch(collection) {
		delete lastFetched[collection];
		var idx = fullyFetched.indexOf(collection);
		if (idx !== -1) {
			fullyFetched.splice(idx, 1);
		}
	}

	var flush = misc.throttled(function() {
		Object.keys(pending).forEach(function(collection) {
			if (paused.indexOf(collection) !== -1 || pending[collection].length === 0) {
				return;
			}

			logger.debug("Sending changes for " + collection +":\n" + pending[collection].map(function(i) { return i.op + " " + i.doc._id; }).join("\n"));
			socket.emit("watch:" + collection, pending[collection]);
			pending[collection] = [];
		});
	}, WATCH_FLUSH_THROTTLE);

	socket._watchPush = function(collection, data, isFetch) {
		if (!isFetch && watchables[collection].sort && fullyFetched.indexOf(collection) === -1) {
			// Collection is sorted and not fully fetched yet,
			// ensure saved document comes before what has been already fetched
			if (!lastFetched[collection] ||
				compareDocs(watchables[collection].sort, data.doc, lastFetched[collection]) > 0) {
				return;
			}
		}

		// Remove previous events on same doc
		pending[collection] = pending[collection].filter(function(item) {
			return item.doc._id !== data.doc._id;
		});

		pending[collection].push(data);
		flush();
	};

	socket.on("disconnect", function() {
		Object.keys(watchables).forEach(function(collection) {
			var sockets = watchables[collection].sockets;
			var idx = sockets.indexOf(socket);

			if (idx !== -1) {
				sockets.splice(idx, 1);
			}
		});

		flush.cancel();

		delete socket._watchPush;
	});

	socket.on("watch:start", function(collection) {
		logger.debug("Start watching " + collection);
		if (collection in watchables && watchables[collection].sockets.indexOf(socket) === -1) {
			watchables[collection].sockets.push(socket);
			pending[collection] = [];
			resetFetch(collection);
		}
	});

	socket.on("watch:fetch", function(collection, count) {
		if (fullyFetched.indexOf(collection) !== -1) {
			return;
		}

		var watchable = watchables[collection];
		var sort = watchable.sort;

		if (!sort) {
			return;
		}

		var last = lastFetched[collection];
		var query = last ? getAfterDocOperator(sort, last) : {};

		watchable.model.find(query).limit(count).exec(function(err, docs) {
			if (err) {
				logger.error("Error fetching " + count + " docs from watched collection " + collection + ": " + err.message);
				return;
			}

			if (docs.length) {
				lastFetched[collection] = docs[docs.length - 1];
			}

			if (docs.length < count) {
				fullyFetched.push(collection);
			}

			docs.forEach(function(doc) {
				socket._watchPush({ op: "fetch", doc: doc.toObject(watchable.toObject) }, true);
			});
		});
	});

	socket.on("watch:pause", function(collection) {
		logger.debug("Pause watching " + collection);
		if (collection in watchables &&
			watchables[collection].sockets.indexOf(socket) !== -1 &&
			paused.indexOf(collection) === -1) {
			paused.push(collection);
		}
	});

	socket.on("watch:resume", function(collection) {
		logger.debug("Resume watching " + collection);
		if (collection in watchables &&
			watchables[collection].sockets.indexOf(socket) !== -1 &&
			paused.indexOf(collection) !== -1) {

			paused.splice(paused.indexOf(collection), 1);
			flush.force();
		}
	});

	socket.on("watch:stop", function(collection) {
		logger.debug("Stop watching " + collection);
		if (collection in watchables) {
			var sockets = watchables[collection].sockets;
			var index = sockets.indexOf(socket);

			if (index !== -1) {
				sockets.splice(index, 1);
				delete pending[collection];

				var pindex = paused.indexOf(collection);
				if (pindex !== -1) {
					paused.splice(pindex, 1);
				}

				resetFetch(collection);
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
