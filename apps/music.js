/*jshint node:true */
"use strict";

var mongoose = require("mongoose"),
	ffprobe = require("node-ffprobe"),
	when = require("when"),
	fs = require("fs"),
	path = require("path"),

	AlbumSchema, Album,
	PlaylistSchema, Playlist,
	rest, nestor;


var mimetypes = {
	"mp3": "audio/mpeg"
};

var coverSearch = {};


/*!
 * Model definitions
 */

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
	return new rest.ResponseFile(this.path, mimetypes[this.format] || "application/octet-stream");
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
					nestor.logger.debug("Found cover for \"" + album.artist + "-" + album.title + "\" in " + searchPath);
					
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

AlbumSchema.set("toObject", {
	virtuals: true,

	transform: function(doc, ret, options) {
		delete ret.cover;
		return ret;
	}
});

Album = mongoose.model("album", AlbumSchema);

/**
 * Playlist schema
 */
PlaylistSchema = new mongoose.Schema({
	name: String,
	tracks: [{
		album: { type: mongoose.Schema.Types.ObjectId, ref: "album" },
		track: Number
	}]
}, { id: false });

Playlist = mongoose.model("playlist", PlaylistSchema);


/* Media analysis handler */
function analyzeFile(args, next) {
	nestor = this;

	var path = args.path;

	function error(action, err) {
		nestor.logger.error("Could not " + action  + ": %s", path, err.message + "\n" + err.stack);
	}
	
	function saveTrackInMatchingAlbum(track) {
		Album.findOne({ "artist": track.artist, "title": track.album }, function(err, album) {
			if (err && err.message === "No matching document found.") {
				err = null;
				album = null;
			}

			if (err) {
				error("find matching album for track %s", err);
				next(false);
			} else {
				if (!album) {
					album = new Album({
						artist: track.artist,
						title: track.album,
						tracks: [track]
					});

					album.save(function(err) {
						if (err) {
							error("save track %s in new album", err);
						}

						album.fetchCover(track.path);
						next(false);
					});
				} else {
					album.addTrack(track, function(err) {
						if (err) {
							error("add track %s to matching album", err);
						}

						album.fetchCover(track.path);
						next(false);
					});
				}
			}
		});
	}

	ffprobe(path, function ffprobeHandler(err, data) {
		var meta, track;
		
		if (err) {
			error("probe file %s", err);
			next();
			return;
		}
		
		if (!data.streams || data.streams.length != 1 || data.streams[0].codec_type !== "audio") {
			// Unknown file type
			next();
		} else {
			meta = data.metadata || { title: "", artist: "", album:	"", track: "", date: "" };
			track = {
				path: path,
				title: meta.title || "",
				artist: meta.artist || "",
				album: meta.album || "",
				number: parseInt(meta.track, 10),
				year: parseInt(meta.date, 10),
				
				format: data.format.format_name,
				bitrate: data.format.bit_rate,
				length: data.format.duration
			};
			
			if (isNaN(track.number)) {
				track.number = -1;
			}
			
			if (isNaN(track.year)) {
				track.year = -1;
			}

			Album.findOne({ "tracks.path": path }, function(err, album) {
				if (err) {
					error("find album with track %s", err);
					next(false);
					return;
				}

				if (album) {
					if (album.title === track.album && album.artist === track.artist) {
						// Found identical album containing track, update it
						album.updateTrack(track, function(err) {
							if (err) {
								error("update album with track %s", err);
							}

							album.fetchCover(track.path);

							next(false);
						});
					} else {
						// Remove track from this album
						album.removeTrack(track, function(err) {
							if (err) {
								error("remove track %s from current album", err);
							}

							saveTrackInMatchingAlbum(track);
						});
					}
				} else {
					saveTrackInMatchingAlbum(track);
				}
			});
		}
	});
}


exports.init = function(nestor) {
	rest = nestor.rest;
	nestor.intents.register("media.analyzeFile", analyzeFile.bind(nestor));

	rest.mongooseResource("albums", Album, { sort: { artist: "asc", title: "asc" } });

	return when.resolve();
};

exports.manifest = {
	description: "Music library",
	deps: [ "media" ],
	clientApps: [ "music" ]
};
