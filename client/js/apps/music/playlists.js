/*jshint browser:true */
/*global define */
define([
	"ui", "dom",

	"resources", "util", "player",

	"ist!templates/playlists"
], function(ui, dom, resources, util, player, template) {
	"use strict";

	var $$ = dom.$$,
		$P = dom.$P;


	function dataUpdater(data, playlists) {
		if (!data) {
			data = { playlists: [] };
		}

		data.playlists = data.playlists.concat(playlists);
		return data;
	}

	var behaviour = {
		"li.track": {
			/* Prevent text selection*/
			"mousedown": function(e) {
				e.preventDefault();
				return false;
			},

			"dblclick": function(e) {
				e.preventDefault();

				var playlist = $P(this, ".playlist"),
					tracks = $$(this.parentNode, ".track"),
					index = tracks.indexOf(this);

				player.replace(tracks, playlist.dataset.name);
				player.play(index);

				return false;
			}
		},
	};

	return {
		init: function(music) {
			music.setupListHandler(
				"playlists",
				resources.playlists,
				dataUpdater,
				template,
				behaviour
			);
		}
	};
});