/*jshint node:true */
"use strict";

var mongoose = require("mongoose"),
	ffprobe = require("node-ffprobe"),
	when = require("when"),

	AlbumSchema, Album,
	PlaylistSchema, Playlist;

	
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
		file: String,
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

AlbumSchema.methods.findTrackIndex = function(path) {
	for (var i = 0, l = this.tracks.length; i < l; i++) {
		if (this.tracks[i].file === path) {
			return i;
		}
	}
};

AlbumSchema.methods.updateTrack = function(track, cb) {
	var index = this.findTrackIndex(track.file),
		updateObject = {};

	Object.keys(track).forEach(function(key) {
		updateObject["tracks." + index + "." + key] = track[key];
	});

	this.update({ $set: updateObject }, cb);
};

AlbumSchema.methods.removeTrack = function(track, cb) {
	this.update({ $pull: { tracks: { "file": track.file } } }, cb);
};

AlbumSchema.methods.addTrack = function(track, cb) {
	this.update({ $push: { tracks: track } }, cb);
};

AlbumSchema.pre("save", function(next) {
	// Sort tracks by number
	this.tracks.sort(function(a, b) {
		return a.number - b.number;
	});

	next();
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
	var nestor = this,
		path = args.path;

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

						next(false);
					});
				} else {
					album.addTrack(track, function(err) {
						if (err) {
							error("add track %s to matching album", err);
						}

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
			nestor.logger.warn("Unknown file type %s", path);
			next();
		} else {
			meta = data.metadata || { title: "", artist: "", album:	"", track: "", date: "" };
			track = {
				file: path,
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

			Album.findOne({ "tracks.file": path }, function(err, album) {
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
	nestor.intents.register("media.analyzeFile", analyzeFile.bind(nestor));

	nestor.rest.mongooseResource("albums", Album);

	return when.resolve();
};

exports.manifest = {
	description: "Music library",
	deps: [ "media" ],
	clientApps: [ "music" ]
};
