/*jshint node:true */

"use strict";

var url = require("url"),
	http = require("http"),
	https = require("https"),
	zlib = require("zlib");

var wget = module.exports = function(uri, callback) {
	var parsed = url.parse(uri),
		request = parsed.protocol === "http" ? http : https;

	request.get(url, function(response) {
		var buffers = [];
		var length = 0;
		var type = response.headers["content-type"];

		function handleData(err, data) {
			callback(err, type, data);
		}

		response.on("data", function (chunk) {
			buffers.push(chunk);
			length += chunk.length;
		});

		response.on("end", function () {
			if (response.statusCode === 200) {
				var body = Buffer.concat(buffers, length);

				switch (response.headers["content-encoding"]) {
					case "gzip":
						zlib.gunzip(body, handleData);
						break;
					case "deflate":
						zlib.deflate(body, handleData);
						break;
					default:
						handleData(null, body);
						break;
				}
			} else if (response.statusCode >= 300 && response.statusCode < 400) {
				var location = response.headers.location;
				if (location) {
					wget(location, callback);
				} else {
					callback(new Error("Received redirect response with no location header. status = " +
						response.statusCode));
				}
			} else {
				callback(new Error("Unknown response code recieved from metadata request. code = " +
					response.statusCode));
			}
		});
	}).on("error", function (e) {
		callback(e);
	});
};
