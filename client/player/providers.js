/*jshint browser:true*/
/*global define*/

define(["player/track"], function(StreamingTrack) {
	"use strict";

	var providers = {};

	return {
		register: function(name, provider) {
			providers[name] = provider;
		},

		getTrack: function(trackdef, index) {
			var track;

			if (trackdef.track) {
				track = trackdef.track;
			} else if (trackdef.builtin) {
				track = new StreamingTrack(trackdef.provider, trackdef.id);
			} else {
				track = providers[trackdef.provider](trackdef.id);
				track._provider = trackdef.provider;
				track._id = trackdef.id;
			}

			track._position = index;

			track.playable.memorize = true;
			track.loaded.memorize = true;
			track.lengthChanged.memorize = true;

			return track;
		}
	};
});