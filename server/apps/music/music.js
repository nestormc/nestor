/*jshint node:true */
"use strict";

var ffprobe = require("node-ffprobe"),
	when = require("when"),
	path = require("path"),
	taglib = require("taglib"),

	cover = require("./cover"),
	track = require("./track"),
	playlist = require("./playlist"),

	Track = track.model;


/* Media analysis handler */
function analyzeFile(nestor, args, next) {
	var filepath = args.path;

	function error(action, err) {
		nestor.logger.error("Could not " + action  + ": %s", filepath, err.message + "\n" + err.stack);
	}

	taglib.read(filepath, function(err, meta, audio) {
		if (err) {
			// error("read file %s", err);
			return next();
		}

		var trackdata = {
			path: filepath,
			title: meta.title || "",
			artist: meta.artist || "",
			album: meta.album || "",
			number: meta.track || -1,
			year: meta.year || -1,

			bitrate: audio.bitrate,
			length: audio.length
		};
		
		Track.findOne({ path: filepath }, function(err, track) {
			if (err) {
				error("find track %s", err);
				next(false);
				return;
			}

			if (track) {
				track.update(trackdata, function(err) {
					if (err) {
						error("update track %s", err);
					}

					next(false);
				});
			} else {
				track = new Track(trackdata);
				track._isNew = true;
				
				track.save(function(err) {
					if (err) {
						error("save track %s", err);
					}

					cover.fetchFSCover("album:" + trackdata.artist + ":" + trackdata.album, path.dirname(filepath));
					next(false);
				});
			}
		});
	});
}


exports.init = function(nestor) {
	nestor.intents.register("media.analyzeFile", analyzeFile.bind(null, nestor));

	nestor.auth.declareRights([
		{
			name: "edit-tags",
			route: "/tracks/:id",
			methods: ["PUT", "PATCH"],
			description: "Edit album and track metadata"
		}
	]);

	cover.restSetup(nestor.rest);
	track.restSetup(nestor.rest);
	playlist.restSetup(nestor.rest);

	nestor.share.registerShareHandler("music", function(id, builder, callback) {
		if (id.indexOf(":") === -1) {
			callback(new Error("Invalid resource id: " + id));
			return;
		}

		var parts = id.split(":"),
			type = parts.shift();

		if (type === "track") {
			var trackId = parts.shift();
			track.model.findById(trackId, function(err, track) {
				if (err || !track) {
					callback(new Error("Invalid track: " + trackId));
					return;
				}

				builder.addFile(path.basename(track.path), track.path);
				callback();
			});
		} else if (type === "album") {
			// Find artist and albums, inside which colons have been doubled
			// (eg artist = "foo", album = "bar:baz" => "foo:bar::baz")
			var mergedParts = [],
				state = "search";

			parts.forEach(function(part) {
				switch(state) {
					case "search":
						mergedParts.push(part);
						state = "part";
						break;

					case "part":
						if (part.length) {
							mergedParts.push(part);
						} else {
							state = "continue";
						}
						break;

					case "continue":
						mergedParts[mergedParts.length - 1] += ":" + part;
						state = "part";
						break;
				}
			});

			var artist = mergedParts[0],
				album = mergedParts[1];

			track.model.find({ artist: artist, album: album }, function(err, tracks) {
				if (err || !tracks || !tracks.length) {
					callback(new Error("Invalid album: " + parts.join(":")));
					return;
				}

				var albumdir = artist + " - " + album;

				tracks.forEach(function(track) {
					var trackfile =
							(track.number > 0 ? String("0" + track.number).slice(-2) + " - " : "") +
							track.title +
							"." + track.format;

					builder.addFile(path.join(albumdir, trackfile), track.path);
				});

				builder.setDownloadFilename(albumdir + ".zip");
				callback();
			});
		} else {
			callback(new Error("Invalid resource type: " + type));
		}
	});

	return when.resolve();
};

exports.manifest = {
	description: "Music library",
	deps: [ "media" ],
	clientApps: [ "music" ]
};
