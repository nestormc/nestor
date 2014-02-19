/*jshint browser:true */
/*global define */

define(["when", "signals"], function(when, signals) {
	"use strict";


	var pendingRequests = [],
		heartbeatRate = 1000,
		heartbeatRunning = false;


	function doHeartBeat() {
		heartbeatRunning = true;

		request("text", "GET", "/heartbeat")
		.then(function() {
			heartbeatRunning = false;
			ajax.connectionStatusChanged.dispatch(true);

			pendingRequests.forEach(function(r) {
				request(r.data.type, r.data.method, r.data.uri, r.data.data, r.deferred);
			});

			pendingRequests = [];
		})
		.otherwise(function() {
			setTimeout(doHeartBeat, heartbeatRate);
		});
	}


	/**
	 * State change handler for request()"s XMLHttpRequest object
	 * Takes a deferred as an argument, and resolves it with the
	 * request result, or rejects it when an error occurs.
	 */
	function onStateChange(type, xhr, d) {
		if (xhr.readyState !== 4) {
			return;
		}
		
		if (xhr.status === 200) {
			if (type === "json") {
				var err, data;

				try {
					data = JSON.parse(xhr.responseText);
				} catch(e) {
					err = e;
				}

				if (err) {
					d.reject(err);
				} else {
					d.resolve(data);
				}
			} else {
				d.resolve(type === "text" ? xhr.responseText : xhr.responseXML);
			}
		} else if (xhr.status === 204) {
			// No content
			d.resolve();
		} else if (xhr.status === 0) {
			// No connectivity

			if (xhr.requestData.uri === "/heartbeat") {
				d.reject();
			} else {
				pendingRequests.push({ data: xhr.requestData, deferred: d });
				if (!heartbeatRunning) {
					ajax.connectionStatusChanged.dispatch(false);
					doHeartBeat();
				}
			}
		} else {
			d.reject(new Error("HTTP "+ xhr.status));
		}
		
		xhr.requestData = null;
		xhr.onreadystatechange = null;
		xhr.abort();
	}
	
	
	/**
	 * JSON ajax request helper
	 *
	 * @param {String} type response type ("text", "xml" or "json")
	 * @param {String} method request method; case-insensitive, maps "del" to "delete"
	 * @param {String} uri request URI
	 * @param {Object} [data] request data
	 */
	function request(type, method, uri, data, d) {
		var xhr = new XMLHttpRequest();
		
		d = d || when.defer();
			
		if (method.toUpperCase() === "DEL") {
			method = "DELETE";
		}
		
		xhr.requestData = { type: type, method: method, uri: uri, data: data };
		xhr.onreadystatechange = onStateChange.bind(null, type, xhr, d);
		xhr.open(method.toUpperCase(), uri, true);

		if (type === "xml") {
			xhr.overrideMimeType("text/xml");
		}
		
		if ("object" === typeof data && null !== data) {
			xhr.setRequestHeader("Content-Type", "application/json");
			data = JSON.stringify(data);
		}
		
		try {
			xhr.send(data || null);
		} catch(e) {
			d.reject(e);
		}

		return d.promise;
	}

	var cached = {
			xml: {},
			text: {},
			json: {}
		};

	function cachedRequest(type, uri) {
		var cache = cached[type];

		if (!(uri in cache)) {
			cache[uri] = request(type, "GET", uri);
		}

		return cache[uri];
	}

	
	var ajax = {
		connectionStatusChanged: new signals.Signal(),

		text: request.bind(null, "text"),
		xml: request.bind(null, "xml"),
		json: request.bind(null, "json"),
		cachedText: cachedRequest.bind(null, "text"),
		cachedXML: cachedRequest.bind(null, "xml"),
		cachedJSON: cachedRequest.bind(null, "json")
	};

	return ajax;
});