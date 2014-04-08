/*jshint node:true*/
"use strict";

var socketio = require("socket.io");
var intents = require("./intents");
var misc = require("./misc");
var logger = require("log4js").getLogger("io");

var FLUSH_THROTTLE = 100;
var VERBOSE_DEBUG = false;


/* A "nestor:watchable"(name, Model, options) intent enables watching
   changes in a collection from the client using socket.io.

   Clients can use the following messages to watch a named watchable
   (all with <name> as an argument):
   - "watch:start": start watching
   - "watch:stop": stop watching
   - "watch:pause": pause watching but keep track of what happens
   - "watch:resume": resume watching, sending all changes that happened
     while paused ASAP

   They receive "watch:<name>" messages, with an array of objects containing:
   - "op": "save" or "remove"
   - "doc": saved or removed document

   Those messages are sent at most once every FLUSH_THROTTLE millisecs for
   each collection to each client.

   The "nestor:watchable:save"(name, doc) and "nestor:watchable:remove"(name, doc)
   intents trigger manual updates to be sent to clients watching <name>.



   If <Model> is a mongoose model:
   - "save" and "remove" hooks on the model trigger update message, except when
     <options> contains a truthy "noHooks" key
   - if <options> contains a "toObject" key, it is used to transform documents
     before sending updates.
   - if <options> contains a "sort" key, it indicates a sort operator for the
     collection.  In this case, clients must send "watch:fetch"(name, count, callback)
     messages to get the contents of the collection first. The callback receives an
     error and an array of documents as parameters.  Updates are only sent when
     updated documents come before the last fetched document according to the sort
     operator.

   Otherwise, <Model> must be null or undefined.  In this case, manual intents
   must be dispatched to send updates,  <options> is unused, and other means of
   fetching the full collection must be used (eg. REST).
 */


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


function triggerSave(collection, doc) {
	var watchable = watchables[collection];

	if (watchable) {
		if (VERBOSE_DEBUG) {
			logger.debug("--- save %s ---", collection);
			logger.debug("  => %s", doc.title || doc._id || JSON.stringify(doc));
		}

		var data = { op: "save", doc: watchable.model ? doc.toObject(watchable.toObject) : doc };

		// Push change to every socket watching this collection
		watchable.sockets.forEach(function(socket) {
			socket._watchPush(collection, data);
		});
	}
}


function triggerRemove(collection, doc) {
	var watchable = watchables[collection];

	if (watchable) {
		if (VERBOSE_DEBUG) {
			logger.debug("--- remove %s ---", collection);
			logger.debug("  => %s", doc.title || doc._id || JSON.stringify(doc));
		}

		var data = { op: "remove", doc: watchable.model ? doc.toObject(watchable.toObject) : doc };

		// Push change to every socket watching this collection
		watchable.sockets.forEach(function(socket) {
			socket._watchPush(collection, data);
		});
	}
}


var watchables = {};
intents.on("nestor:watchable", function(name, Model, options) {
	options = options || {};

	watchables[name] = {
		sockets: [],

		model: Model,

		sort: Model ? options.sort : null,
		toObject: Model ? options.toObject : null
	};

	if (Model && !options.noHooks) {
		Model.schema.post("save", function(doc) {
			triggerSave(name, doc);
		});

		Model.schema.post("remove", function(doc) {
			triggerRemove(name, doc);
		});
	}
});

/* Allow manual trigger of watched events */
intents.on("nestor:watchable:save", triggerSave);
intents.on("nestor:watchable:remove", triggerRemove);


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

			if (VERBOSE_DEBUG) {
				logger.debug("--- flushing %s ---", collection);
				pending[collection].forEach(function(item) {
					logger.debug("  %s %s", item.op, item.doc.title || item.doc._id || JSON.stringify(item.doc));
				});
			}

			socket.emit("watch:" + collection, pending[collection]);
			pending[collection] = [];
		});
	}, FLUSH_THROTTLE);

	function watchPush(collection, data) {
		if (!(collection in pending)) {
			pending[collection] = [];
		} else {
			// Remove previous events on same doc
			pending[collection] = pending[collection].filter(function(item) {
				return item.doc ? item.doc._id.toString() !== data.doc._id.toString() : true;
			});
		}

		pending[collection].push(data);
		flush();
	}

	socket._watchPush = function(collection, data, isFetch) {
		var watchable = watchables[collection];
		var sort = watchable.sort;

		if (!isFetch && sort) {
			// Collection is sorted

			if (fullyFetched.indexOf(collection) === -1) {
				// Not fully fetched yet, ensure saved document
				// comes before what has been already fetched
				if (!lastFetched[collection] ||
					compareDocs(sort, data.doc, lastFetched[collection]) > 0) {
					return;
				}
			}

			// Find document next to saved document
			watchable.model.findOne(getAfterDocOperator(sort, data.doc), function(err, doc) {
				if (err) {
					socket.emit("watch:" + collection + ":error", "Error while looking for next document in collection: " + err.message);
				} else {
					data.next = doc;
					watchPush(collection, data);
				}
			});
		} else {
			watchPush(collection, data);
		}
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
		if (collection in watchables && watchables[collection].sockets.indexOf(socket) === -1) {
			watchables[collection].sockets.push(socket);
			pending[collection] = [];
			resetFetch(collection);
		} else if (!(collection in watchables)) {
			socket.emit("watch:" + collection + ":error", "Unknown collection");
		}
	});

	socket.on("watch:fetch", function(collection, count, callback) {
		if (fullyFetched.indexOf(collection) !== -1) {
			return;
		}

		var watchable = watchables[collection];
		var sort = watchable.sort;

		if (!sort) {
			callback("Unsorted collection cannot be fetched");
			return;
		}

		var last = lastFetched[collection];
		var query = last ? getAfterDocOperator(sort, last) : {};

		watchable.model.find(query).sort(sort).limit(count).exec(function(err, docs) {
			if (err) {
				callback(err.message);
				logger.error("Error fetching " + count + " docs from watched collection " + collection + ": " + err.message);
				return;
			}

			if (VERBOSE_DEBUG) {
				logger.debug("--- fetching %s ---", collection);
			}

			if (docs.length) {
				lastFetched[collection] = docs[docs.length - 1];
			}

			if (docs.length < count) {
				fullyFetched.push(collection);
				if (VERBOSE_DEBUG) {
					logger.debug("  => fully fetched");
				}
			}

			if (VERBOSE_DEBUG) {
				docs.forEach(function(doc) {
					logger.debug("  fetch %s", doc.title || doc._id || JSON.stringify(doc));
				});
			}

			callback(null, docs.map(function(d) { return d.toObject(watchable.toObject); }));
		});
	});

	socket.on("watch:pause", function(collection) {
		if (collection in watchables &&
			watchables[collection].sockets.indexOf(socket) !== -1 &&
			paused.indexOf(collection) === -1) {
			paused.push(collection);
		}
	});

	socket.on("watch:resume", function(collection) {
		if (collection in watchables &&
			watchables[collection].sockets.indexOf(socket) !== -1 &&
			paused.indexOf(collection) !== -1) {

			paused.splice(paused.indexOf(collection), 1);
			flush.force();
		}
	});

	socket.on("watch:stop", function(collection) {
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
	var io = socketio.listen(server, {
			"browser client minification": true,
			"browser client etag": true,
			"browser client gzip": true,
			"logger": {
				debug: function(msg) {
					logger.debug("(socket.io) %s", msg);
				},

				info: function(msg) {
					logger.info("(socket.io) %s", msg);
				},

				warn: function(msg) {
					logger.warn("(socket.io) %s", msg);
				},

				error: function(msg) {
					logger.error("(socket.io) %s", msg);
				}
			}
		});

	io.on("connection", function(socket) {
		enableWatchers(socket);
	});
};
