/*jshint browser:true */
/*global define, console */

define(["ui"], function(ui) {
	"use strict";

	function trackDispose(track, events) {
		Object.keys(events).forEach(function(event) {
			track.removeEventListener(event, events[event]);
		});

		track.trackLoaded.dispose();
		track.pause();
		track.preload = "none";
		track.src = "";

		delete track.dispose;
	}


	function trackPlayable(track, player) {
		var index = player.tracks.indexOf(track);

		track.isPlayable = true;

		// Start playing if player wants to play this track
		if (player.playing === index) {
			track.currentTime = track.requestedCurrentTime || 0;

			if (!track.requestedSeekOnly) {
				track.play();
			}
		}
	}


	function trackError(track, player) {
		console.log("Error with track " + track.data.id);
		console.dir(track.error);
		
		player.trackLoadingFailed.dispatch(track.data.id);
		trackEnded(track, player);
	}


	function trackEnded(track, player) {
		var tracks = player.tracks,
			index = tracks.indexOf(track);

		if (index !== tracks.length - 1) {
			player.play(index + 1);
		} else {
			player.playing = -1;
			player.updatePlayTime();
			player.currentTrackChanged.dispatch();
			player.playStateChanged.dispatch(false);
		}
	}


	function trackLoadProgress(track) {
		if (track.isLoading && track.buffered.length) {
			if (Math.abs(track.buffered.end(track.buffered.length - 1) - track.duration) < 0.1) {
				// Track is loaded
				track.isLoaded = true;
				track.isLoading = false;

				track.trackLoaded.dispatch();
			}
		}
	}


	function trackTimeUpdate(track, player) {
		player.updatePlayTime(track);
	}
	

	return function createAudioTrack(player, element) {
		var audio = new Audio();

		audio.preload = "none";
		audio.autoplay = false;
		audio.isLoaded = false;
		audio.trackLoaded = ui.signal();

		var events = {
			"canplay": trackPlayable.bind(null, audio, player),
			"ended": trackEnded.bind(null, audio, player),
			"timeupdate": trackTimeUpdate.bind(null, audio, player),
			"progress": trackLoadProgress.bind(null, audio),
			"error": trackError.bind(null, audio, player)
		};

		Object.keys(events).forEach(function(event) {
			audio.addEventListener(event, events[event]);
		});

		audio.dispose = trackDispose.bind(null, audio, events);

		audio.data = element.dataset;
		audio.src = element.dataset.file;

		return audio;
	};
});