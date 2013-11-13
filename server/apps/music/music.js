/*jshint node:true */
"use strict";

var ffprobe = require("node-ffprobe"),
	when = require("when"),
	path = require("path"),

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

	ffprobe(filepath, function ffprobeHandler(err, data) {
		if (err) {
			error("probe file %s", err);
			next();
			return;
		}
		
		if (!data.streams || data.streams.length != 1 || data.streams[0].codec_type !== "audio") {
			// Unknown file type
			next();
		} else {
			var meta = data.metadata || { title: "", artist: "", album:	"", track: "", date: "" };
			var trackdata = {
				path: filepath,
				title: meta.title || "",
				artist: meta.artist || "",
				album: meta.album || "",
				number: parseInt(meta.track, 10),
				year: parseInt(meta.date, 10),
				
				format: data.format.format_name,
				bitrate: data.format.bit_rate,
				length: data.format.duration
			};
			
			if (isNaN(trackdata.number)) {
				trackdata.number = -1;
			}
			
			if (isNaN(trackdata.year)) {
				trackdata.year = -1;
			}

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
					track.save(function(err) {
						if (err) {
							error("save track %s", err);
						}

						cover.fetchFSCover("album:" + trackdata.artist + ":" + trackdata.album, path.dirname(filepath));
						next(false);
					});
				}
			});
		}
	});
}


exports.init = function(nestor) {
	nestor.intents.register("media.analyzeFile", analyzeFile.bind(null, nestor));

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
