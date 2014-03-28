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
					mimetype:		optional, media mime type
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
 * Transcoding presets
 */


var presets = {
	video: {
		webm: {
			mimetype: "video/webm",
			codecs: "vp8.0, vorbis",

			acodec: "libvorbis",
			abitrates: {
				"144": "64k",
				"288": "128k",
				"*": "160k"
			},

			vcodec: "libvpx",
			voptions: {
				"*": ["-crf 15", "-preset ultrafast"]
			}
		},

		mp4: {
			mimetype: "video/mp4",
			codecs: "h264, aac",

			acodec: "libvo_aacenc",
			abitrates: {
				"144": "64k",
				"*": "128k"
			},

			vcodec: "libx264",
			voptions: {
				"*": ["-crf 30", "-preset ultrafast"]
			}
		},

		ogg: {
			mimetype: "video/ogg",
			codecs: "theora, vorbis",

			acodec: "libvorbis",
			abitrates: {
				"144": "64k",
				"288": "128k",
				"*": "160k"
			},

			vcodec: "libtheora",
			voptions: {
				"*": ["-qscale:v 6"]
			}
		}
	},

	audio: {
		mp3: {
			mimetype: "audio/mpeg",
			codecs: "mp3",

			acodec: "libmp3lame"
		},

		mp4: {
			mimetype: "audio/mp4",
			codecs: "aac",

			acodec: "libvo_aacenc",
		},

		ogg: {
			mimetype: "audio/ogg",
			codecs: "vorbis",

			acodec: "libvorbis"
		},

		webm: {
			mimetype: "audio/webm",
			codecs: "vorbis",

			acodec: "libvorbis"
		}
	}
};


function findQualityValue(lines, obj) {
	var lowest = Infinity;
	var current;

	Object.keys(obj).forEach(function(key) {
		var value = key === "*" ? Infinity : Number(key);

		if (value > lines && value <= lowest) {
			current = obj[key];
		}
	});

	return current;
}


function applyPreset(type, name, command) {
	var parts = name.split(":");
	var format, lines, bitrate;

	if (type === "video") {
		format = parts[0];
		lines = Number(parts[1]);

		if (isNaN(lines)) {
			throw new Error("Invalid vertical resolution: " + parts[1]);
		}
	} else {
		format = parts[0];
		bitrate = Number(parts[1]);

		if (isNaN(bitrate)) {
			throw new Error("Invalid audio bitrate: " + parts[1]);
		}
	}

	if (!(format in presets[type])) {
		throw new Error("Unknown " + type + " format: " + format);
	}

	var preset = presets[type][format];

	command
		.withAudioCodec(preset.acodec)
		.withAudioChannels(2);

	if (type === "audio") {
		command.withAudioBitrate(bitrate);
	} else  {
		command
			.withAudioBitrate(findQualityValue(lines, preset.abitrates))
			.withVideoCodec(preset.vcodec)
			.withSize("?x" + lines);

		if (preset.vbitrates) {
			command.withVideoBitrate(findQualityValue(lines, preset.vbitrates));
		}

		if (preset.voptions) {
			command.addOptions(findQualityValue(lines, preset.voptions));
		}
	}

	return command.toFormat(format);
}



/*!
 * Express middleware
 */


exports.listen = function(app) {
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
					mimetype: data.mimetype,
					length: data.length,
					cover: data.cover,
					title: data.title,
					subtitle: data.subtitle,
					formats: presets[data.type]
				});
			});
		});


	/* Streaming endpoint */
	app.get("/stream/:provider/:id/:format/:seek", function(req, res) {
		var name = req.param("provider");

		if (!(name in providers)) {
			logger.warn("Unknown provider requested: %s", name);
			return res.send(400);
		}

		var id = req.param("id");
		providers[name](id, function(err, data) {
			if (err) {
				logger.warn("Error requesting %s/%s: %s", name, id, err.message);
				return res.send(500);
			}

			if (!data) {
				return res.send(404);
			}

			if (["audio", "video"].indexOf(data.type) === -1) {
				logger.warn("Invalid stream type for %s/%s: %s", name, id, err.message);
				return res.send(500);
			}

			var command = new Ffmpeg({ source: data.source, timeout: 0 });

			try {
				applyPreset(data.type, req.param("format"), command);
			} catch(e) {
				logger.warn("Preset error for %s/%s: %s", name, id, e.message);
				return res.send(400);
			}

			if (data.options && data.options.length) {
				command.addOptions(data.options);
			}

			if (data.filters) {
				data.filters.forEach(function(filter) {
					command.withVideoFilter(filter);
				});
			}

			res.setHeader("X-Nestor-Stream", "TODO-Stream-ID");

			if (data.mimetype) {
				res.setHeader("Content-Type", data.mimetype);
			}

			if (data.length) {
				res.setHeader("X-Content-Duration", data.length);
			}

			command
				.setStartTime(parseFloat(req.param("seek")))
				.on("error", function() {
					// Just catch error events to prevent nestor from stopping
				})
				.writeToStream(res);
		});
	});
};
