/*jshint node:true*/
"use strict";

var Ffmpeg = require("fluent-ffmpeg");
var yarm = require("yarm");
var logger = require("log4js").getLogger("streaming");
var Writable = require("stream").Writable;
var util = require("util");

var intents = require("./intents");
var FASTSEEK_THRESHOLD = 30;


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
 * Transfer speed measurement
 */


function measureSpeed(interval) {
	interval = interval || 1000;

	var startTime = null;
	var totalSize = 0;
	var chunks = [];

	function pruneChunks(now) {
		while (chunks.length && (now - chunks[0].date) > interval) {
			chunks.shift();
		}
	}

	return {
		update: function(chunk) {
			var now = Date.now();
			pruneChunks(now);

			if (!startTime) {
				// First update
				startTime = now;
			}

			totalSize += chunk.length;
			chunks.push({ date: now, size: chunk.length });
		},

		get current() {
			pruneChunks(Date.now());
			return 1000 * chunks.reduce(function(sum, chunk) {
				return sum + chunk.size;
			}, 0) / interval;
		},

		get average() {
			return startTime ? 1000 * totalSize / (Date.now() - startTime) : 0;
		}
	};
}


function MeasureStream(output, interval, options) {
	Writable.call(this, options);
	var self = this;

	interval = interval || 1000;

	this._output = output;
	this._full = false;
	this._finished = false;
	this._pending = [];

	function outputDrained() {
		self._full = false;
		self._flush();
	}

	function outputClosed() {
		logger.debug("MeasureStream output closed");
		self.emit("close");
		cleanup();
	}

	function outputErrored(err) {
		logger.debug("MeasureStream output err: %s", err.message);
		self.emit("error", err);
		cleanup();
	}

	function thisFinished() {
		logger.debug("MeasureStream finished");
		self._finished = true;

		if (!self._pending.length) {
			self._flush();
		}
	}

	function thisFinishFlushed() {
		logger.debug("MeasureStream final flush done");
		cleanup();
	}

	output.on("drain", outputDrained);
	output.on("close", outputClosed);
	output.on("error", outputErrored);
	this.on("finish", thisFinished);
	this.on("finish-flushed", thisFinishFlushed);

	this._inputMeasure = measureSpeed(interval);
	this._inputSpeed = 0;
	this._outputMeasure = measureSpeed(interval);
	this._outputSpeed = 0;

	this._interval = setInterval(function() {
		var inputSpeed = self._inputMeasure.current;

		if (inputSpeed !== self._inputSpeed) {
			self._inputSpeed = inputSpeed;
			self.emit("input-speed", inputSpeed);
		}

		var outputSpeed = self._outputMeasure.current;

		if (outputSpeed !== self._outputSpeed) {
			self._outputSpeed = outputSpeed;
			self.emit("output-speed", outputSpeed);
		}
	}, interval);

	function cleanup() {
		clearInterval(self._interval);

		output.removeListener("drain", outputDrained);
		output.removeListener("close", outputClosed);
		output.removeListener("error", outputErrored);

		self.removeListener("finish", thisFinished);
		self.removeListener("finish-flushed", thisFinishFlushed);
	}
}
util.inherits(MeasureStream, Writable);


MeasureStream.prototype._write = function(chunk, encoding, done) {
	this._inputMeasure.update(chunk);
	this._pending.push(chunk);
	this._flush();
	done();
};


MeasureStream.prototype._flush = function() {
	while (!this._full && this._pending.length) {
		var chunk = this._pending.shift();

		this._full = !this._output.write(chunk);
		this._outputMeasure.update(chunk);
	}

	if (this._finished && !this._pending.length) {
		this._output.end();
		this.emit("finish-flushed");
	}
};


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
				"aac": /aac/,
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
		"aac": {
			name: "aac",
			options: ["-strict -2", "-q:a 100"]
		}
	},

	vcodecs: {
		"libvpx": {
			name: "vp8.0",
			options: ["-crf 15", "-preset ultrafast"]
		},
		"libvpx-vp9": "vp9.0",
		"libx264": {
			name: "h264",
			options: ["-profile:v high", "-level 5.0"]
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
		"video/mp4;libx264;aac"
	]
};



/*!
 * Ffmpeg capability detection
 */



var ffmpegAvailable = false;
intents.on("nestor:startup", function getFfmpegCapabilities() {
	var command = new Ffmpeg({ source: "" });
	var availableCodecs;
	var availableFormats;
	var availableFilters;

	command.getAvailableFormats(function(err, formats) {
		if (err) {
			logger.warn("Ffmpeg is not available");
			return;
		}

		availableFormats = formats;
		command.getAvailableCodecs(function(err, codecs) {
			availableCodecs = codecs;

			// Try to find codec for AAC

			command.getAvailableFilters(function(err, filters) {
				availableFilters = filters;

				logger.info("Fffmpeg capabilities retrieved, ready to stream");
				ffmpegAvailable = true;
			});
		});
	});
});




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


function createAudioCommand(data, streamspec, bitrate, candidates, seekTime) {
	var command = new Ffmpeg({ source: data.source, timeout: 0 }).withNoVideo();

	if (isNaN(bitrate)) {
		bitrate = data.bitrate;
	}

	// Select streams
	var selectedStreams = addStreamOptions(command, data, streamspec);
	logger.debug("Selected streams: %j", selectedStreams);
	logger.debug("Candidates: %j", candidates);

	var audioStream = selectedStreams.audio;
	var audioCopy = false;

	if (bitrate === data.bitrate && seekTime === 0) {
		// Attempt to copy audio stream if requested bitrate matches source bitrate and no seek requested
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

		if (bitrate !== data.bitrate) {
			command.withAudioBitrate(bitrate);
		}

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


function createVideoCommand(data, streamspec, height, candidates, seekTime) {
	var command = new Ffmpeg({ source: data.source, timeout: 0 });

	if (isNaN(height)) {
		height = data.height;
	}

	// Select streams
	var selectedStreams = addStreamOptions(command, data, streamspec);
	logger.debug("Selected streams: %j", selectedStreams);
	logger.debug("Candidates: %j", candidates);

	var audioStream = selectedStreams.audio;
	var audioCopy = false;

	var videoStream = selectedStreams.video;
	var videoCopy = false;

	if (data.height === height && seekTime === 0) {
		// Attempt to copy video stream
		var videoCopyCandidates = matchVideo(candidates, videoStream);

		if (videoCopyCandidates.length) {
			candidates = videoCopyCandidates;
			videoCopy = true;
		}
	}

	if (seekTime === 0) {
		// Try to copy audio stream
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

	if (videoCopy) {
		logger.debug("Can copy video");
		command.withVideoCodec("copy");
	} else {
		command.withVideoCodec(chosen.vcodec);

		if (height !== data.height) {
			command.withSize("?x" + height);
		}

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

	   Querystring optional parameters:
	    client: "cast" for chromecast, anything else for web client (default)
	    streams: stream selection, eg. "audio:1,video:3", or "auto" (default)
	    seek: start position in seconds (defaults to 0)
		quality: height for video streams, bitrate for audio streams, or "original" (default)
	*/
	app.get("/stream/:provider/:id", function(req, res) {
		var name = req.param("provider");
		var id = req.param("id");

		if (!ffmpegAvailable) {
			logger.warn("Stream %s/%s requested but ffmpeg is not available", name, id);
			return res.send(503);
		}

		if (!(name in providers)) {
			logger.warn("Unknown provider requested: %s", name);
			return res.send(400);
		}

		var client = req.param("client") || "web";
		var clientCapabilities = client === "cast" ? castCapabilities : req.session.streamingCapabilities;
		if (!clientCapabilities) {
			logger.warn("Stream %s/%s requested but client capabilities are unknown", name, id);
			return res.send(503);
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
			var seekTime = Number(req.param("seek") || 0);

			try {
				if (data.type === "audio") {
					command = createAudioCommand(
						data,
						req.param("streams") || "auto",
						Number(req.param("quality") || data.bitrate),
						mapCandidates(clientCapabilities.audio),
						seekTime
					);
				} else {
					command = createVideoCommand(
						data, req.param("streams") || "auto",
						Number(req.param("quality") || data.height),
						mapCandidates(clientCapabilities.video),
						seekTime
					);
				}
			} catch(e) {
				logger.warn("Command error for %s/%s: %s", name, id, e.stack);
				return res.send(400);
			}

			// Apply seek

			if (seekTime > 0 && seekTime < FASTSEEK_THRESHOLD) {
				// Use slow seek for seek times < 30s
				command.addOptions(["-ss " + seekTime]);
			} else {
				command
					// Use fast seek for seek - 30s
					.setStartTime(seekTime - FASTSEEK_THRESHOLD)
					// Then slow seek the remaining 30s
					.addOptions(["-ss " + FASTSEEK_THRESHOLD]);
			}

			// Send response

			res.contentType(command._nestorMimetype);

			if (data.length) {
				res.setHeader("X-Content-Duration", data.length - seekTime);
			}

			// Setup speed measurement

			/*
			var measure = new MeasureStream(res);
			measure.on("input-speed", function(speed) {
				logger.debug("Input speed = %s kB/s", Math.round(speed/1024));
			});
			measure.on("output-speed", function(speed) {
				logger.debug("Output speed = %s kB/s", Math.round(speed/1024));
			});
			*/

			command
				.on("codecData", function(data) {
					logger.debug("Codec data: %j", data);
				})
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
				.on("end", function() {
					logger.debug("Transcoding finished");
				})
				.writeToStream(res);
		});
	});
};
