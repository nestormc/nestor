/*jshint node:true */
"use strict";

var mongoose = require("mongoose"),
	spawn = require("child_process").spawn,
	taglib = require("taglib"),

	logger = require("log4js").getLogger("music");



/**
 * Track schema
 */
var TrackSchema = new mongoose.Schema({
	path: { type: String, index: 1 },

	artist: String,
	album: String,
	number: Number,
	title: String,
	year: Number,

	bitrate: Number,
	length: Number
});


TrackSchema.index({ artist: 1, album: 1, number: 1 });

TrackSchema.virtual("file").get(function() {
	return { path: this.path };
});

TrackSchema.pre("save", function(next) {
	var track = this;

	taglib.tag(this.filepath, function(err, tag) {
		if (err) {
			logger.warn("Could not reload tags to file %s: %s", track.filepath, err.message);
			return next();
		}

		tag.artist = track.artist;
		tag.album = track.album;
		tag.title = track.title;
		tag.track = track.number === -1 ? 0 : track.number;
		tag.year = track.year === -1 ? 0 : track.year;

		tag.save(function(err) {
			if (err) {
				logger.warn("Could not save tags to file %s: %s", track.filepath, err.message);
			}

			next();
		});
	});
});

var Track = mongoose.model("track", TrackSchema);


/**
 * Exports
 */

module.exports = {
	schema: TrackSchema,
	model: Track,

	restSetup: function(rest) {
		rest.mongooseResource("tracks", Track, {
			sort: { artist: 1, album: 1, number: 1 },

			toObject: {
				virtuals: true,

				transform: function(doc, ret, options) {
					delete ret.__v;
					delete ret.id;
				}
			},

			overrides: {
				"tracks/$/file": {
					get: function(chain, req, cb) {
						var file = chain[chain.length - 1],
							mime = "";

						var child = spawn("file", ["-ib", file.path]);
						
						child.stdout.on("data", function(data) {
							mime += data.toString();
						});

						child.stdout.on("end", function() {
							cb(null, new rest.ResponseFile(file.path, mime));
						});
					}
				}
			}
		});
	}
};
