/*jshint browser:true*/
/*global define, console*/

define(["rest", "when"], function(rest, when) {
	"use strict";

	var deferred = when.defer();
	var clientCapabilities = {
			audio: [],
			video: []
		};


	function sendCapabilities() {
		return rest.post("stream/formats", clientCapabilities);
	}


	// Query available formats and codecs
	rest.get("stream/formats")
	.then(function(formats) {
		// Check playable audio format/codec combos
		var audio = new Audio();
		Object.keys(formats.audio).forEach(function(mimetype) {
			Object.keys(formats.audio[mimetype].acodecs).forEach(function(codec) {
				var codecname = formats.audio[mimetype].acodecs[codec];
				var canplay = audio.canPlayType(mimetype + "; codecs=\"" + codecname + "\"");

				if (canplay === "probably") {
					clientCapabilities.audio.push(mimetype + ";" + codec);
				}
			});
		});

		// Check playable video format/codec combos
		var video = document.createElement("video");
		Object.keys(formats.video).forEach(function(mimetype) {
			Object.keys(formats.video[mimetype].vcodecs).forEach(function(vcodec) {
				var vcodecname = formats.video[mimetype].vcodecs[vcodec];

				Object.keys(formats.video[mimetype].acodecs).forEach(function(acodec) {
					var acodecname = formats.video[mimetype].acodecs[acodec];

					var canplay = video.canPlayType(mimetype + "; codecs=\"" + vcodecname + ", " + acodecname + "\"");
					if (canplay === "probably") {
						clientCapabilities.video.push(mimetype + ";" + vcodec + ";" + acodec);
					}
				});
			});
		});

		// Send capabilities to server
		sendCapabilities()
		.then(function() {
			deferred.resolve();
		})
		.otherwise(function(err) {
			console.log("capabilities: could not post client capabilities, " + err.message);
			deferred.reject(err);
		});
	})
	.otherwise(function(err) {
		console.log("capabilities: could not get server capabilities, " + err.message);
		deferred.reject(err);
	});


	// Send capabilities again on reconnect
	rest.connectionStatusChanged.add(function(connected) {
		if (connected) {
			sendCapabilities();
		}
	});


	return deferred.promise;
});