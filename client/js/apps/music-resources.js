/*jshint browser:true */
/*global require, define, $, $$ */

define([], function() {
	"use strict";
	
	return function(rest) {
		return {
			albums: {
				list: function(cb) {
					return rest.incremental("albums", cb);
				}
			},

			playlists: {
				list: function(cb) {
					rest.list("playlists", { limit: 0 }, cb);
				},

				create: function(name) {
					return rest.post("playlists", { name: name });
				},

				addTrack: function(name, track) {
					return rest.post("playlists/" + name, { _id: track.dataset.id });
				}
			}
		};
	};
});