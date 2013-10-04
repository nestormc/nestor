/*jshint browser:true */
/*global define */

define(["when"], function(when) {
	"use strict";


	/**
	 * State change handler for request()"s XMLHttpRequest object
	 * Takes a deferred as an argument, and resolves it with the
	 * parsed request JSON result, or rejects it when an error
	 * occurs.
	 */
	function onStateChange(type, xhr, d) {
		if (xhr.readyState !== 4) {
			return;
		}
		
		if (xhr.status === 200) {
			d.resolve(type === "text" ? xhr.responseText : xhr.responseXML);
		} else if (xhr.status === 204) {
			// No content
			d.resolve();
		} else {
			d.reject(new Error("HTTP " + xhr.status));
		}
		
		xhr.onreadystatechange = null;
		xhr.abort();
	}
	
	
	/**
	 * JSON ajax request helper
	 *
	 * @param {String} type response type ("text" or "xml")
	 * @param {String} method request method; case-insensitive, maps "del" to "delete"
	 * @param {String} uri request URI
	 * @param {Object} [data] request data
	 */
	function request(type, method, uri, data) {
		var xhr = new XMLHttpRequest(),
			d = when.defer();
			
		if (method.toUpperCase() === "DEL") {
			method = "DELETE";
		}
		
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

	var cachedXML = {},
		cachedText = {};

	function cachedRequest(type, uri) {
		var cache = type === "xml" ? cachedXML : cachedText;

		if (!(uri in cache)) {
			cache[uri] = request(type, "GET", uri);
		}

		return cache[uri];
	}

	
	return {
		text: request.bind(null, "text"),
		xml: request.bind(null, "xml"),
		cachedText: cachedRequest.bind(null, "text"),
		cachedXML: cachedRequest.bind(null, "xml")
	};
});