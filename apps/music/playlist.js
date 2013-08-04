/*jshint node:true */
"use strict";

var mongoose = require("mongoose"),
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

Playlist = mongoose.model("playlist", PlaylistSchema);

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

				transform: function(doc, ret, options) {
					delete ret.__v;
					delete ret.id;
					delete ret.trackRefs;
				}
			},

			overrides: {
				"playlists/$": {
					post: function(playlist, req, cb) {
						Album.findOne(
							{ tracks: { $elemMatch: { _id: req.body._id } } },
							function(err, album) {
								if (err) {
									cb(err);
								} else if (!album) {
									err = new Error("Track not found");
									err.code = 400;
									cb(err);
								} else {
									playlist.trackRefs.push({ album: album, trackId: req.body._id });
									playlist.save(function(err) {
										cb(err);
									});
								}
							}
						);
					}
				}
			}
		});
	}
};
