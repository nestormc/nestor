/*jshint browser:true*/
/*global define*/
define(["signals", "socketio", "when"], function(signals, socketio, when) {
	"use strict";


	function CollectionWatcher(io, collection) {
		this._io = io;
		this._collection = collection;

		this._io.emit("watch:start", this._collection);

		this.updated = new signals.Signal();
		this.removed = new signals.Signal();

		var self = this;
		this._io.on("watch:" + collection, function(changes) {
			changes.forEach(function(change) {
				if (change.op === "save" || change.op === "fetch") {
					self.updated.dispatch(change.doc, change.next);
				} else if (change.op === "remove") {
					self.removed.dispatch(change.doc);
				}
			});
		});

		this._io.on("watch:" + collection + ":error", function(err) {
			console.log("Watch error on collection " + collection + ": " + err);
		});
	}

	["pause", "resume"].forEach(function(message) {
		CollectionWatcher.prototype[message] = function() {
			this._io.emit("watch:" + message, this._collection);
		};
	});

	CollectionWatcher.prototype.fetch = function(count) {
		var d = when.defer();

		this._io.emit("watch:fetch", this._collection, count, function(err, docs) {
			if (err) {
				d.reject(err);
			} else {
				d.resolve(docs);
			}
		});

		return d.promise;
	};

	CollectionWatcher.prototype.dispose = function() {
		this._io.emit("watch:stop", this._collection);
	};


	var origin = location.origin;
	var rootIo;
	var io = {
		_namespace: null,
		_io: null,

		pluginIO: function(plugin) {
			var sub = Object.create(io);
			sub._namespace = plugin;
			sub._io = null;
			return sub;
		},

		connect: function() {
			if (!this._io) {
				if (this.namespace) {
					this._io = socketio.connect(origin + "/" + this._namespace);
				} else {
					this._io = rootIo = socketio.connect(origin);
				}
			}
		},

		disconnect: function() {
			this._io.disconnect();
			this._io = null;
		},

		watch: function(collection) {
			// Collections are always watched on root IO connection
			return new CollectionWatcher(rootIo, collection);
		}
	};
	
	return io;
});