/*jshint browser:true */
/*global require, define */

define(["signals"], function(signals) {
	"use strict";

	var serverAlive = true,
		heartBeatRate = 2000,
		pendingRequests = [],
		pendingThrottle = 200;

	/**
	 * State change handler for request()"s XMLHttpRequest object
	 * Takes a deferred as an argument, and resolves it with the
	 * parsed request JSON result, or rejects it when an error
	 * occurs.
	 */
	function onStateChange(xhr, callback) {
		if (xhr.readyState !== 4) {
			return;
		}
		
		if (xhr.status === 200) {
			try {
				var obj = JSON.parse(xhr.responseText);
				callback(null, obj);
			} catch(e) {
				callback(e);
			}
		} else if (xhr.status === 204) {
			// No content
			callback();
		} else {
			callback(new Error("HTTP " + xhr.status));
		}
		
		xhr.onreadystatechange = null;
		xhr.abort();
	}
	
	
	/**
	 * JSON ajax request helper
	 *
	 * @param {String} method request method; case-insensitive, maps "del" to "delete"
	 * @param {String} uri request URI
	 * @param {Object} [data] request data
	 */
	function request(method, uri, data, callback) {
		if (!serverAlive && uri !== "/heartbeat") {
			pendingRequests.push([method, uri, data, callback]);
			return;
		}

		var xhr = new XMLHttpRequest();
			
		if (method.toUpperCase() === "DEL") {
			method = "DELETE";
		}
		
		xhr.onreadystatechange = onStateChange.bind(null, xhr, callback);
		xhr.open(method.toUpperCase(), uri, true);
		
		if ("object" === typeof data && null !== data) {
			xhr.setRequestHeader("Content-Type", "application/json");
			data = JSON.stringify(data);
		}
		
		try {
			xhr.send(data || null);
		} catch(e) {
			callback(e);
		}
	}
	
	
	/**
	 * JSON ajax request method-specific helpers:
	 *   request.get
	 *   request.head
	 *   request.patch
	 *   request.post
	 *   request.put
	 *   request.del
	 */
	"get post put patch del".split(" ").forEach(function(method) {
		request[method] = request.bind(null, method);
	});


	function makeURI(uri, querystring) {
		if (Object.keys(querystring || {}).length) {
			uri += "?" + Object.keys(querystring).map(function(param) {
				return param + "=" + encodeURIComponent(querystring[param]);
			}).join("&");
		}

		return "/rest/" + uri;
	}


	var rest = {
		heartBeatLost: new signals.Signal(),
		heartBeatRestored: new signals.Signal(),

		list: function(uri, options, cb) {
			var querystring = {};
			options = options || {};

			if ("skip" in options) {
				querystring.skip = options.skip;
			}

			if ("limit" in options) {
				querystring.limit = options.limit;
			}

			if ("query" in options) {
				querystring.query = options.query;
			}

			request.get(makeURI(uri, querystring), null, function(err, result) {
				if (err) {
					cb(err);
				} else {
					var items = result._items;
					items.totalCount = result._count;

					cb(null, items);
				}
			});
		},

		incremental: function(uri, query, cb) {
			var loading, count,
				rest = this,
				offset = 0;

			if (!cb) {
				cb = query;
				query = "";
			}

			function more() {
				if (loading) {
					// Already loading more
					return;
				}

				loading = true;

				if (count === offset) {
					// Already loaded everything
					cb();
					return;
				}

				rest.list(uri, { skip: offset, query: query }, function(err, result) {
					loading = false;

					if (err) {
						cb(err);
						return;
					}

					count = result.totalCount;
					offset += result.length;

					cb(null, result);
				});
			}

			more();
			return more;
		},

		get: function(uri, querystring, cb) {
			if (!cb && typeof querystring === "function") {
				cb = querystring;
				querystring = null;
			}

			request.get(makeURI(uri, querystring), null, cb);
		},

		put: function(uri, querystring, data, cb) {
			if (!cb && typeof data === "function") {
				cb = data;
				data = querystring;
				querystring = null;
			}

			request.put(makeURI(uri, querystring), data, cb);
		},

		patch: function(uri, querystring, data, cb) {
			if (!cb && typeof data === "function") {
				cb = data;
				data = querystring;
				querystring = null;
			}

			request.patch(makeURI(uri, querystring), data, cb);
		},

		post: function(uri, querystring, data, cb) {
			if (!cb && typeof data === "function") {
				cb = data;
				data = querystring;
				querystring = null;
			}

			request.patch(makeURI(uri, querystring), data, cb);
		},

		del: function(uri, querystring, cb) {
			if (!cb && typeof querystring === "function") {
				cb = querystring;
				querystring = null;
			}

			request.del(makeURI(uri, querystring), null, cb);
		}
	};





	/* Setup heartbeat */
	(function() {
		function processPending() {
			if (!serverAlive) {
				return;
			}

			var req = pendingRequests.shift();

			if (req) {
				request.apply(null, req);
				setTimeout(processPending, pendingThrottle);
			}
		}

		rest.heartBeatRestored.add(processPending);

		function heartBeat() {
			request.get("/heartbeat", null, function(err) {
				if (err) {
					if (serverAlive) {
						rest.heartBeatLost.dispatch(err);
					}

					serverAlive = false;
				} else {
					if (!serverAlive) {
						rest.heartBeatRestored.dispatch();
					}

					serverAlive = true;
				}

				setTimeout(heartBeat, heartBeatRate);
			});
		}

		heartBeat();
	}());

	return rest;
});