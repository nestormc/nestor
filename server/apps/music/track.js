/*jshint node:true */
"use strict";

var mongoose = require("mongoose"),
	fs = require("fs"),
	path = require("path");


var mimetypes = {
	"mp3": "audio/mpeg"
};


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

	format: String,
	bitrate: Number,
	length: Number
});


TrackSchema.index({ artist: 1, album: 1, number: 1 });

TrackSchema.virtual("file").get(function() {
	return {
		path: this.path,
		mimetype: mimetypes[this.format] || "application/octet-stream"
	};
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
						var file = chain[chain.length - 1];
						cb(null, new rest.ResponseFile(file.path, file.mimetype));
					}
				}
			}
		});
	}
};
