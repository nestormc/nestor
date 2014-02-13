/*jshint browser:true*/
/*global define*/

define(function() {
	"use strict";

	var providers = {};

	return {
		register: function(name, provider) {
			providers[name] = provider;
		},
		
		getTrack: function(trackdef) {
			var track = trackdef.track || providers[trackdef.provider](trackdef.id);

			track._provider = trackdef.provider;
			track._id = trackdef.id;

			track.playable.memorize = true;
			track.loaded.memorize = true;
			track.lengthChanged.memorize = true;

			return track;
		}
	};
});