/*jshint node:true */
"use strict";

var ffprobe = require("node-ffprobe"),
	when = require("when"),

	album = require("./album"),
	playlist = require("./playlist"),

	Album = album.model;


/* Media analysis handler */
function analyzeFile(nestor, args, next) {
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
	nestor.intents.register("media.analyzeFile", analyzeFile.bind(null, nestor));

	album.restSetup(nestor.rest);
	playlist.restSetup(nestor.rest);

	return when.resolve();
};

exports.manifest = {
	description: "Music library",
	deps: [ "media" ],
	clientApps: [ "music" ]
};
