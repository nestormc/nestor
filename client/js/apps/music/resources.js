/*jshint browser:true */
/*global require, define, $, $$ */

define(["when", "rest"], function(when, rest) {
	"use strict";
	
	return {
		tracks: {
			list: function() {
				return rest.incremental("tracks", 20);
			},

			update: function(id, data) {
				return rest.patch("tracks/" + id, null, data);
			}
		},

		playlists: {
			list: function() {
				return rest.incremental("playlists");
			},

			get: function(name) {
				return rest.get("playlists/" + name);
			},

			create: function(name) {
				return rest.post("playlists", { name: name });
			},

			remove: function(name) {
				return rest.del("playlists/" + name);
			},

			addTrack: function(name, track, index) {
				return rest.post("playlists/" + name, { index: (index || 0) }, { _id: track.dataset.id });
			},

			replaceTracks: function(name, tracks) {
				var d = when.defer();

				function putTracks() {
					rest.put("playlists/" + name, null, tracks.map(function(track) {
						return { _id: track.dataset.id };
					}))
					.then(function() {
						d.resolve();
					})
					.otherwise(function(err) {
						d.reject(err);
					});
				}

				// Check whether playlist exists
				rest.get("playlists/" + name)
				// It does, put tracks inside
				.then(putTracks)
				.otherwise(function(err) {
					if (err.message === "HTTP 404") {
						// It does not, create playlist first
						rest.post("playlists", { name: name })
						// Then put tracks
						.then(putTracks)
						.otherwise(function(err) {
							d.reject(err);
						});
					} else {
						d.reject(err);
					}
				});

				return d.promise;
			}
		}
	};
});