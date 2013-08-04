/*jshint node:true */
"use strict";

var mongoose = require("mongoose"),
	fs = require("fs"),
	path = require("path"),

	AlbumSchema, Album;


var mimetypes = {
	"mp3": "audio/mpeg"
};

var coverSearch = {};

/**
 * Album schema
 */
AlbumSchema = new mongoose.Schema({
	artist: String,
	title: String,
	cover: Buffer,
	tracks: [{
		path: String,
		artist: String,
		number: Number,
		title: String,
		year: Number,

		format: String,
		bitrate: Number,
		length: Number
	}]
}, { id: false });


/**
 * Virtual property "length"
 * Returns the sum of individual track lengths
 */
AlbumSchema.virtual("length").get(function() {
	return this.tracks.reduce(function(v, track) {
		return v + track.length;
	}, 0);
});

AlbumSchema.path("tracks").schema.virtual("file").get(function() {
	return {
		path: this.path,
		mimetype: mimetypes[this.format] || "application/octet-stream"
	};
});


/**
 * Virtual property "year"
 * Returns an empty string when no tracks have year data
 * Returns the year when all tracks have the same
 * Else returns "minYear-maxYear"
 */
AlbumSchema.virtual("year").get(function() {
	var withYear = this.tracks.filter(function(t) { return t.year !== -1; });

	if (!withYear.length) return "";

	var minYear = withYear.reduce(function(v, t) {
		return Math.min(v, t.year);
	}, 9999);

	var maxYear = withYear.reduce(function(v, t) {
		return Math.max(v, t.year);
	}, 0);

	if (minYear === maxYear) return minYear;
	return minYear + "-" + maxYear;
});

AlbumSchema.virtual("hasCover").get(function() {
	return !!this.cover;
});

AlbumSchema.methods.findTrackIndex = function(path) {
	for (var i = 0, l = this.tracks.length; i < l; i++) {
		if (this.tracks[i].path === path) {
			return i;
		}
	}
};

AlbumSchema.methods.updateTrack = function(track, cb) {
	var index = this.findTrackIndex(track.path),
		updateObject = {};

	Object.keys(track).forEach(function(key) {
		updateObject["tracks." + index + "." + key] = track[key];
	});

	this.update({ $set: updateObject }, cb);
};

AlbumSchema.methods.removeTrack = function(track, cb) {
	this.update({ $pull: { tracks: { "path": track.path } } }, cb);
};

AlbumSchema.methods.addTrack = function(track, cb) {
	this.update({ $push: { tracks: track } }, cb);
};

AlbumSchema.methods.fetchCover = function(trackPath) {
	var album = this;

	if (album.cover) {
		// Already have one, thanks
		return;
	}

	var searchPath = path.dirname(trackPath);

	if (coverSearch[album._id] && coverSearch[album._id].length && coverSearch[album._id].indexOf(searchPath) !== -1) {
		// Already looked in this directory
		return;
	}

	coverSearch[album._id] = coverSearch[album._id] || [];
	coverSearch[album._id].push(searchPath);

	fs.stat(searchPath + "/cover.jpg", function(err, stat) {
		if (stat) {
			fs.readFile(searchPath + "/cover.jpg", function(err, data) {
				if (!err) {
					album.cover = new Buffer(data);
					delete coverSearch[album._id];
					album.save();
				}
			});
		}
	});
};

AlbumSchema.post("init", function(album) {
	// Sort tracks by number
	album.tracks.sort(function(a, b) {
		return a.number - b.number;
	});
});

Album = mongoose.model("album", AlbumSchema);

module.exports = {
	schema: AlbumSchema,
	model: Album,
	restSetup: function(rest) {
		rest.mongooseResource("albums", Album, {
			sort: { artist: "asc", title: "asc" },

			toObject: {
				virtuals: true,

				transform: function(doc, ret, options) {
					delete ret.__v;
					delete ret.id;
					delete ret.cover;
				}
			},

			overrides: {
				"albums/$/tracks/$/file": {
					get: function(file, req, cb) {
						cb(null, new rest.ResponseFile(file.path, file.mimetype));
					}
				},

				"albums/$/cover": {
					get: function(coverBuffer, req, cb) {
						cb(null, new rest.ResponseBody(coverBuffer, "image/jpeg"));
					}
				}
			}
		});

		rest.mongooseResource.aggregate("tracks", Album, [
			{ $project: {
				tracks: 1,
				artist: 1,
				album: "$title"
			} },
			{ $unwind: "$tracks" },
			{ $project: {
				artist: 1,
				album: 1,
				_id: "$tracks._id",
				title: "$tracks.title",
				number: "$tracks.number",
				year: "$tracks.year",
				path: "$tracks.path",
				format: "$tracks.format",
				bitrate: "$tracks.bitrate",
				length: "$tracks.length"
			} },
			{ $sort: {
				"artist": 1,
				"album": 1,
				"number": 1
			} }
		], {
			subResources: {
				"file": function(doc) {
					return {
						get: function(req, cb) {
							cb(null, new rest.ResponseFile(doc.path, mimetypes[doc.format] || "application/octet-stream"));
						}
					};
				}
			}
		});
	}
};
