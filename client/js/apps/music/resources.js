/*jshint browser:true */
/*global require, define, $, $$ */

define(["rest"], function(rest) {
	"use strict";
	
	return {
		albums: {
			list: function(cb) {
				return rest.incremental("albums", cb);
			}
		},

		playlists: {
			list: function(cb) {
				return rest.incremental("playlists", cb);
			},

			create: function(name) {
				//return rest.post("playlists", { name: name });
			},

			addTrack: function(name, track, index) {
				//return rest.post("playlists/" + name + "?index=" + (index || 0), { _id: track.dataset.id });
			},

			replaceTracks: function(name, tracks) {
				/*return rest.put("playlists/" + name, tracks.map(function(track) {
					return { _id: track.dataset.id };
				}));*/
			}
		}
	};
});