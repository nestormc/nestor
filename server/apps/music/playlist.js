/*jshint node:true */
"use strict";

var mongodb = require("mongodb"),
	mongoose = require("mongoose"),

	ObjectId = mongodb.BSONPure.ObjectID,
	Track = require("./track").model;


/**
 * Playlist schema
 */
var PlaylistSchema = new mongoose.Schema({
	name: String,
	tracks: [{ type: mongoose.Schema.Types.ObjectId, ref: "track" }]
}, { id: false });


PlaylistSchema.virtual("artists").get(function() {
	var artistCounts = {};

	this.tracks.forEach(function(track) {
		var artist = track.get("artist");

		if (artist in artistCounts) {
			artistCounts[artist]++;
		} else {
			artistCounts[artist] = 1;
		}
	});

	var artists = Object.keys(artistCounts);
	artists.sort(function(a, b) {
		return artistCounts[b] - artistCounts[a];
	});

	return artists;
});

PlaylistSchema.methods.addTracks = function(index, trackIDs, cb) {
	var $or = [],
		playlist = this;

	trackIDs.forEach(function(id) {
		var oid;

		try {
			oid = new ObjectId(id);
		} catch(e) {
			return;
		}

		$or.push({ _id: oid });
	});

	Track.find($or, function(err, tracks) {
		if (err) {
			cb(err);
			return;
		}

		var foundTracks = {};
		
		tracks.forEach(function(track) {
			foundTracks[track._id.toString()] = track._id;
		});

		for (var i = 0, len = trackIDs.length; i < len; i++) {
			var id = trackIDs[i];

			if (!(id in foundTracks)) {
				err = new Error("Track " + id + " not found");
				err.code = 400;
				cb(err);
				return;
			}

			playlist.tracks.splice(index, 0, foundTracks[id]);
			index++;
		}

		playlist.save(cb);
	});
};


var Playlist = mongoose.model("playlist", PlaylistSchema);


function playlistTransform(doc, ret, options) {
	delete ret.__v;
	delete ret.id;
}


function playlistPOSTHandler(chain, req, cb) {
	var playlist = chain[chain.length - 1],
		index = NaN;

	if (req.param("index")) {
		index = Number(req.param("index"));
	}

	if (isNaN(index)) {
		index = playlist.tracks.length;
	}

	playlist.addTracks(
		Math.max(0, Math.min(playlist.tracks.length, index)),
		[req.body._id],
		cb
	);
}


function playlistPUTHandler(chain, req, isPatch, cb) {
	var playlist = chain[chain.length - 1];

	// Empty playlist
	playlist.tracks.splice(0, playlist.tracks.length);

	// Add tracks from body
	playlist.addTracks(0, req.body.map(function(item) {
		return item._id;
	}), cb);
}


module.exports = {
	schema: PlaylistSchema,
	model: Playlist,
	restSetup: function(rest) {
		rest.mongooseResource("playlists", Playlist, {
			key: "name",

			sort: { name: "asc" },
			
			query: function() {
				return Playlist.find().populate("tracks");
			},

			toObject: {
				virtuals: true,
				transform: playlistTransform
			},

			overrides: {
				"playlists/$": {
					// Add track, body = { _id: trackID }
					post: playlistPOSTHandler,

					// Replace tracks, body = [{ _id: trackID }, ...]
					put: playlistPUTHandler
				}
			}
		});
	}
};