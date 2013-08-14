/*jshint node:true */
"use strict";

var mongodb = require("mongodb"),
	mongoose = require("mongoose"),

	ObjectId = mongodb.BSONPure.ObjectID,
	Album = require("./album").model,

	PlaylistSchema, Playlist;


/**
 * Playlist schema
 */
PlaylistSchema = new mongoose.Schema({
	name: String,
	trackRefs: [{
		album: { type: mongoose.Schema.Types.ObjectId, ref: "album" },
		trackId: mongoose.Schema.Types.ObjectId
	}]
}, { id: false });


PlaylistSchema.virtual("tracks").get(function() {
	return this.trackRefs.map(function(ref) {
		return ref.album.tracks.id(ref.trackId);
	});
});


PlaylistSchema.methods.addTracks = function(index, trackIDs, cb) {
	var $or = [];

	trackIDs.forEach(function(id) {
		var oid;

		try {
			oid = new ObjectId(id);
		} catch(e) {
			return;
		}

		$or.push({ _id: oid });
	});

	// Find all albums with one of the tracks to add
	Album.find(
		{ tracks: { $elemMatch: $or } },
		function(err, albums) {
			if (err) {
				cb(err);
			} else {
				var foundTracks = {};

				// Browse albums to extract requested tracks
				albums.forEach(function(album) {
					albums.tracks.forEach(function(track) {
						if (trackIDs.indexOf(track._id.toString()) !== -1) {
							foundTracks[track._id.toString()] = {
								album: album,
								trackId: track._id
							};
						}
					});
				});

				// Add requested tracks to playlist
				for (var i = 0, len = trackIDs.length; i < len; i++) {
					var id = trackIDs[i];

					if (!(id in foundTracks)) {
						err = new Error("Track " + id + " not found");
						err.code = 400;
						cb(err);
						return;
					}

					this.trackRefs.push(foundTracks[id]);
				}

				this.save(cb);
			}
		}
	);
};


Playlist = mongoose.model("playlist", PlaylistSchema);


function playlistTransform(doc, ret, options) {
	delete ret.__v;
	delete ret.id;
	delete ret.trackRefs;
}


function playlistPOSTHandler(chain, req, cb) {
	var playlist = chain[chain.length - 1],
		index = NaN;

	if (req.param("index")) {
		index = Number(req.param("index"));
	}

	if (isNaN(index)) {
		index = playlist.trackRefs.length;
	}

	playlist.addTracks(
		Math.max(0, Math.min(playlist.trackRefs.length, index)),
		[req.body._id],
		cb
	);
}


function playlistPUTHandler(chain, req, cb) {
	var playlist = chain[chain.length - 1];

	// Empty playlist
	playlist.trackRefs.splice(0, playlist.trackRefs.length);

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
				return Playlist.find().populate("trackRefs.album");
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