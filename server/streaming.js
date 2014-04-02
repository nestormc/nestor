/*jshint node:true*/
"use strict";

var Ffmpeg = require("fluent-ffmpeg");
var yarm = require("yarm");
var logger = require("log4js").getLogger("streaming");

var intents = require("./intents");



/*!
 * Streaming providers registration
 */


var providers = {};
intents.on("nestor:streaming", function(name, provider) {
	/* Expected provider signature:
		function provider(resourceid, callback) {
			callback(
				err?,
				{
					source:			mandatory, source file path or readable stream
					type:			mandatory, "audio" or "video"
					format:			mandatory, format name (as returned by ffmpeg)
					streams:		mandatory, stream list (containing 'number', 'type' and 'codec' as returned by ffmpeg)

					bitrate:		mandatory for "audio" tracks, bitrate in kbps,
					width:			|
					height:			| mandatory for "video" tracks, source size in pixels

					filters:		optional, array of ffmpeg video filters
					options:		optional, array of custom ffmpeg options
					length:			optional, media length in seconds
					cover:			optional, cover url for "audio" tracks
					title:			optional, media title
					subtitle:		optional, media subtitle
				}
			);
		}
	 */

	providers[name] = provider;
});



/*!
 * Transcoding capabilities
 */

var capabilities = {
	aformats: {
		"audio/mpeg": {
			format: "mp3",
			compat: /mp3/,
			acodecs: {
				"libmp3lame": /mp3/
			}
		},

		"audio/ogg": {
			format: "ogg",
			compat: /ogg/,
			acodecs: {
				"libvorbis": /vorbis/,
				"opus": /opus/
			}
		}
	},

	vformats: {
		"video/webm": {
			format: "webm",
			compat: /webm|matroska/,
			acodecs: {
				"libvorbis": /vorbis/,
				"opus": /opus/
			},
			vcodecs: {
				"libvpx": /vp8/,
				"libvpx-vp9": /vp9/
			}
		},

		"video/mp4": {
			format: "mp4",
			compat: /mp4/,
			acodecs: {
				"libvo_aacenc": /aac/,
				"libmp3lame": /mp3/
			},
			vcodecs: {
				"libx264": function(stream) {
					return stream.codec.match(/[xh]264/) &&
						["High", "Main"].indexOf(stream.profile) !== -1 &&
						[31, 4, 40, 41, 42, 5, 50, 51].indexOf(stream.level) !== -1;
				}
			}
		},

		"video/ogg": {
			format: "ogg",
			compat: /ogg/,
			acodecs: {
				"libvorbis": /vorbis/
			},
			vcodecs: {
				"libtheora": /theora/
			}
		}
	},

	acodecs: {
		"libvorbis": "vorbis",
		"opus": "opus",
		"libmp3lame": "mp3",
		"libvo_aacenc": "aac"
	},

	vcodecs: {
		"libvpx": {
			name: "vp8.0",
			options: ["-crf 15", "-preset ultrafast"]
		},
		"libvpx-vp9": "vp9.0",
		"libx264": {
			name: "h264",
			options: ["-crf 30", "-preset ultrafast"]
		},
		"libtheora": {
			name: "theora",
			options: ["-qscale:v 6"]
		}
	}
};


// Map capabilities object to send to clients as JSON
var clientFormats = (function() {
	var vformats = {};
	var aformats = {};

	var caformats = capabilities.aformats;
	Object.keys(caformats).forEach(function(mime) {
		var caformat = caformats[mime];

		aformats[mime] = {
			acodecs: {}
		};

		Object.keys(caformat.acodecs).forEach(function(codec) {
			var codecDef = capabilities.acodecs[codec];
			aformats[mime].acodecs[codec] = typeof codecDef === "string" ? codecDef : codecDef.name;
		});
	});

	var cvformats = capabilities.vformats;
	Object.keys(cvformats).forEach(function(mime) {
		var cvformat = cvformats[mime];

		vformats[mime] = {
			acodecs: {},
			vcodecs: {}
		};

		Object.keys(cvformat.acodecs).forEach(function(codec) {
			var codecDef = capabilities.acodecs[codec];
			vformats[mime].acodecs[codec] = typeof codecDef === "string" ? codecDef : codecDef.name;
		});

		Object.keys(cvformat.vcodecs).forEach(function(codec) {
			var codecDef = capabilities.vcodecs[codec];
			vformats[mime].vcodecs[codec] = typeof codecDef === "string" ? codecDef : codecDef.name;
		});
	});

	return { "audio": aformats, "video": vformats };
}());


// Chromecast capabilities
var castCapabilities = {
	"audio": [
		"audio/ogg;libvorbis",
		"audio/mpeg;libmp3lame"
	],

	"video": [
		"video/webm;libvpx;libvorbis",
		"video/mp4;libx264;libvo_aacenc"
	]
};



/*!
 * FfmpegCommand instanciation and codec matching logic
 */

function addStreamOptions(command, data, streams) {
	var ret = {};

	if (streams === "auto") {
		// Select first streams of the expected types
		streams = [];

		if (data.type == "video") {
			streams.push("video:" + data.streams.filter(function(s) { return s.type === "video"; })[0].index);
		}

		streams.push("audio:" + data.streams.filter(function(s) { return s.type === "audio"; })[0].index);
	} else {
		streams = streams.split(",");
	}

	streams.forEach(function(stream) {
		var parts = stream.split(":");
		var type = parts[0];
		var index = Number(parts[1]);

		var streamspec = data.streams.filter(function(s) { return s.index === index; })[0];
		if (!streamspec) {
			throw new Error("Unknown stream index requested: " + index);
		}

		if (streamspec.type !== type) {
			throw new Error("Requested using " + streamspec.type + " stream " + index + " as " + type + " stream");
		}

		ret[type] = streamspec;
		command.addOptions([
			"-map:" + (type === "audio" ? "a" : "v") + " 0:" + index
		]);
	});

	return ret;
}


function mapCandidates(candidates) {
	return candidates.map(function(candidate) {
		var split = candidate.split(";");

		if (split.length === 2) {
			return { format: split[0], acodec: split[1] };
		} else {
			return { format: split[0], vcodec: split[1], acodec: split[2] };
		}
	});
}


function matchAudio(candidates, audioStream) {
	var isOnlyAudio = !candidates.some(function(c) { return "vcodec" in c; });

	return candidates.filter(function(candidate) {
		try {
			var caps = isOnlyAudio ? capabilities.aformats : capabilities.vformats;
			var matcher = caps[candidate.format].acodecs[candidate.acodec];

			if (matcher instanceof RegExp) {
				return audioStream.codec.match(matcher);
			} else if (typeof matcher === "function") {
				return matcher(audioStream);
			} else {
				return audioStream.codec === matcher;
			}
		} catch(e) {
			logger.warn("Error while matching: %s (stream: %j, candidate: %j)", e.message, audioStream, candidate);
			return false;
		}
	});
}


function matchVideo(candidates, videoStream) {
	return candidates.filter(function(candidate) {
		try {
			var matcher = capabilities.vformats[candidate.format].vcodecs[candidate.vcodec];

			if (matcher instanceof RegExp) {
				return videoStream.codec.match(matcher);
			} else if (typeof matcher === "function") {
				return matcher(videoStream);
			} else {
				return videoStream.codec === matcher;
			}
		} catch(e) {
			logger.warn("Error while matching: %s (stream: %j, candidate: %j)", e.message, videoStream, candidate);
			return false;
		}
	});
}


function createAudioCommand(data, streamspec, bitrate, candidates) {
	var command = new Ffmpeg({ source: data.source, timeout: 0 }).withNoVideo();

	// Select streams
	var selectedStreams = addStreamOptions(command, data, streamspec);
	logger.debug("Selected streams: %j", selectedStreams);
	logger.debug("Candidates: %j", candidates);

	var audioStream = selectedStreams.audio;
	var audioCopy = false;

	if (bitrate === data.bitrate) {
		// Attempt to copy audio stream if requested bitrate matches source bitrate
		var audioCopyCandidates = matchAudio(candidates, audioStream);

		if (audioCopyCandidates.length) {
			candidates = audioCopyCandidates;
			audioCopy = true;
		}
	}

	// Use first remaining candidate
	var chosen = candidates[0];
	logger.debug("Chose candidate: %j", chosen);

	if (audioCopy) {
		logger.debug("Can copy audio");
		command.withAudioCodec("copy");
	} else {
		command.withAudioCodec(chosen.acodec);

		var acodecDef = capabilities.acodecs[chosen.acodec];
		if (typeof acodecDef === "object" && "options" in acodecDef) {
			command.addOptions(acodecDef.options);
		}
	}

	// Apply provider options
	if (data.options && data.options.length) {
		command.addOptions(data.options);
	}

	// Apply format and save mimetype
	command.toFormat(capabilities.aformats[chosen.format].format);
	command._nestorMimetype = chosen.format;

	return command;
}


function createVideoCommand(data, streamspec, height, candidates) {
	var command = new Ffmpeg({ source: data.source, timeout: 0 });

	// Select streams
	var selectedStreams = addStreamOptions(command, data, streamspec);
	logger.debug("Selected streams: %j", selectedStreams);
	logger.debug("Candidates: %j", candidates);

	var audioStream = selectedStreams.audio;
	var audioCopy = false;

	var videoStream = selectedStreams.video;
	var videoCopy = false;

	if (data.height === height) {
		// Attempt to copy video stream
		var videoCopyCandidates = matchVideo(candidates, videoStream);

		if (videoCopyCandidates.length) {
			candidates = videoCopyCandidates;
			videoCopy = true;
		}
	}

	// Try to copy audio stream
	var audioCopyCandidates = matchAudio(candidates, audioStream);

	if (audioCopyCandidates.length) {
		candidates = audioCopyCandidates;
		audioCopy = true;
	}

	// Use first remaining candidate
	var chosen = candidates[0];
	logger.debug("Chose candidate: %j", chosen);

	if (audioCopy) {
		logger.debug("Can copy audio");
		command.withAudioCodec("copy");
	} else {
		command.withAudioCodec(chosen.acodec);

		var acodecDef = capabilities.acodecs[chosen.acodec];
		if (typeof acodecDef === "object" && "options" in acodecDef) {
			command.addOptions(acodecDef.options);
		}
	}

	if (videoCopy) {
		logger.debug("Can copy video");
		command.withVideoCodec("copy");
	} else {
		command.withVideoCodec(chosen.vcodec);

		var vcodecDef = capabilities.vcodecs[chosen.vcodec];
		if (typeof vcodecDef === "object" && "options" in vcodecDef) {
			command.addOptions(vcodecDef.options);
		}
	}

	// Apply provider options
	if (data.options && data.options.length) {
		command.addOptions(data.options);
	}

	// Apply provider filters
	if (data.filters) {
		data.filters.forEach(function(filter) {
			command.withVideoFilter(filter);
		});
	}

	// Apply format and save mimetype
	command.toFormat(capabilities.vformats[chosen.format].format);
	command._nestorMimetype = chosen.format;

	return command;
}


/*!
 * Express middleware
 */


exports.listen = function(app) {
	/* REST endpoint to query available formats and codecs */
	yarm.resource("stream/formats")
		.get(function(req, cb) {
			cb(null, clientFormats);
		})
		.post(function(req, cb) {
			req.session.streamingCapabilities = req.body;
			cb.noContent();
		});


	/* REST endpoint to query streamable resource information */
	yarm.resource("stream/:provider/:id")
		.get(function(req, cb) {
			var name = req.param("provider");

			if (!(name in providers)) {
				logger.warn("Unknown provider requested: %s", name);
				return cb.badRequest();
			}

			var id = req.param("id");
			providers[name](id, function(err, data) {
				if (err) {
					logger.warn("Error requesting %s/%s: %s", name, id, err.message);
					return cb(err);
				}

				if (!data) {
					return cb.notFound();
				}

				if (["audio", "video"].indexOf(data.type) === -1) {
					logger.warn("Invalid stream type for %s/%s: %s", name, id, err.message);
					return cb(new Error("Invalid stream type"));
				}

				cb(null, {
					type: data.type,
					bitrate: data.bitrate,
					width: data.width,
					height: data.height,

					length: data.length,
					cover: data.cover,
					title: data.title,
					subtitle: data.subtitle
				});
			});
		});


	/* Streaming endpoint
		provider: stream provider name
		id: stream ID
		client: "cast" for chromecast, anything else for normal client
		streams: stream selection, eg. "audio:1,video:3", or "auto"
		quality: height for video streams, bitrate for audio streams
		seek: start position in seconds
	*/
	app.get("/stream/:provider/:id/:client/:streams/:quality/:seek", function(req, res) {
		var name = req.param("provider");
		var id = req.param("id");

		if (!(name in providers)) {
			logger.warn("Unknown provider requested: %s", name);
			return res.send(400);
		}

		var clientCapabilities = req.param("client") === "cast" ? castCapabilities : req.session.streamingCapabilities;
		if (!clientCapabilities) {
			logger.warn("Stream %s/%s requested but client capabilities are unknown", name, id);
			return res.send(412);
		}

		providers[name](id, function(err, data) {
			// Check for stream validity

			if (err) {
				logger.warn("Error requesting %s/%s: %s", name, id, err.message);
				return res.send(404);
			}

			if (!data) {
				return res.send(404);
			}

			if (["audio", "video"].indexOf(data.type) === -1) {
				logger.warn("Invalid stream type for %s/%s: %s", name, id, err.message);
				return res.send(500);
			}

			// Instanciate ffmpeg command

			var command;

			try {
				if (data.type === "audio") {
					command = createAudioCommand(data, req.param("streams"), Number(req.param("quality")), mapCandidates(clientCapabilities.audio));
				} else {
					command = createVideoCommand(data, req.param("streams"), Number(req.param("quality")), mapCandidates(clientCapabilities.video));
				}
			} catch(e) {
				logger.warn("Command error for %s/%s: %s", name, id, e.stack);
				return res.send(400);
			}

			// Send response

			res.contentType(command._nestorMimetype);

			if (data.length) {
				res.setHeader("X-Content-Duration", data.length);
			}

			command
				.setStartTime(parseFloat(req.param("seek")))
				.on("start", function(cmdline) {
					logger.debug("Started transcoding: %s", cmdline);
				})
				.on("error", function(err, stdout, stderr) {
					if (err.message !== "Output stream closed") {
						logger.error(
							"Streaming error for %s/%s: %s\n---ffmpeg stdout--\n%s\n---ffmpeg stderr---\n%s",
							name, id, err.message, stdout, stderr
						);
					}
				})
				.writeToStream(res);
		});
	});
};
