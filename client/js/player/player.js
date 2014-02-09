/*jshint browser: true*/
/*global define*/

define(
["ist!tmpl/player", "components/index", "dom", "router"],
function(template, components, dom, router) {
	"use strict";

	var playlist = [];
	var playing = false;
	var playlistIndex = -1;

	var trackProviders = {};


	function clamp(index) {
		return (index + playlist.length) % playlist.length;
	}


	function stopCurrentTrack() {
		if (playlistIndex !== -1) {
			var current = playlist[playlistIndex];

			current.pause();

			if (current._display && current._display.parentNode) {
				current._display.parentNode.removeChild(current._display);
			}

			current.loaded.removeAll();
			current.playable.removeAll();
			current.ended.removeAll();
			current.timeChanged.removeAll();
			current.lengthChanged.removeAll();
		}
	}


	function playTrack(index, fromStart) {
		stopCurrentTrack();

		index = clamp(index);
		var track = playlist[index];

		playlistIndex = index;
		playing = true;

		// Add length handler
		if (track.lengthChanged.getNumListeners() === 0) {
			track.lengthChanged.add(function(length) {
				dom.$("#player .slider").setRange(length);
				dom.$("#player .slider").setAvailable(length);
			});
		}

		// Ensure track started loading
		track.load();

		// Start loading next track when this one is done
		track.loaded.addOnce(function() {
			if (playlistIndex + 1 < playlist.length) {
				playlist[playlistIndex + 1].load();
			}
		});

		if (fromStart) {
			track.seek(0);
		}

		// Add time handler
		if (track.timeChanged.getNumListeners() === 0) {
			track.timeChanged.add(function(time) {
				track._time = time;
				dom.$("#player .slider").setValue(time);
			});
		}

		// Start playback as soon as possible
		track.playable.addOnce(function() {
			var meta = track.getMetadata();

			dom.$("#player .metadata .title").innerHTML = meta.title;
			dom.$("#player .metadata .subtitle").innerHTML = meta.subtitle || "";

			var display = track.getDisplay();
			display.classList.add("track-display");
			dom.$("#player .display").appendChild(display);

			track._display = display;
			track.play();
		});

		// Play next track when this one is done playing
		track.ended.addOnce(function() {
			if (playlistIndex + 1 < playlist.length) {
				playTrack(playlistIndex + 1, true);
			} else {
				playing = false;
			}
		});
	}


	function getTrack(trackdef) {
		var track = trackdef.track || trackProviders[trackdef.provider](trackdef.id);

		track._provider = trackdef.provider;
		track._id = trackdef.id;

		track.playable.memorize = true;
		track.loaded.memorize = true;
		track.lengthChanged.memorize = true;

		return track;
	}


	var REWIND_THRESHOLD = 5;
	var playbackControls = {
		next: function() {
			if (playlist.length) {
				if (playing) {
					playTrack(playlistIndex + 1, true);
				} else {
					playlistIndex = clamp(playlistIndex + 1);
				}
			}
		},

		prev: function() {
			if (playlist.length) {
				if (playing) {
					if (playlist[playlistIndex]._time < REWIND_THRESHOLD) {
						playTrack(playlistIndex - 1, true);
					} else {
						playTrack(playlistIndex, true);
					}
				} else {
					playlistIndex = clamp(playlistIndex - 1);
					playlist[playlistIndex].seek(0);
				}
			}
		},

		play: function() {
			if (playlist.length) {
				playTrack(playlistIndex);
			}
		},

		pause: function() {
			if (playlist.length) {
				playlist[playlistIndex].pause();
				playing = false;
			}
		},

		seek: function(time) {
			if (playlist.length) {
				playlist[playlistIndex].seek(time);
			}
		}
	};


	var fadeTime = 2000;
	var fadeTimeout;
	function prepareFade() {
		fadeTimeout = setTimeout(function() {
			if (dom.$("#player").classList.contains("fullscreen")) {
				dom.$("#player").classList.add("fade");
				dom.$("#player .slider").classList.add("one-pixel");
			}
		}, fadeTime);
	}


	var playerBehaviour = {
		"#player": {
			"mousemove": function() {
				dom.$("#player").classList.remove("fade");
				dom.$("#player .slider").classList.remove("one-pixel");

				if (fadeTimeout) {
					clearTimeout(fadeTimeout);
				}

				prepareFade();
			}
		}
	};


	return {
		render: function() {
			var slider = components.slider();
			slider.setAvailable(1);
			slider.live = false;
			slider.changed.add(playbackControls.seek);

			var rendered = template.render({
				slider: slider,
				behaviour: playerBehaviour
			});

			router.on("!player/play", function(err, req, next) {
				playbackControls.play();
				next();
			});

			router.on("!player/pause", function(err, req, next) {
				playbackControls.pause();
				next();
			});

			router.on("!player/prev", function(err, req, next) {
				playbackControls.prev();
				next();
			});

			router.on("!player/next", function(err, req, next) {
				playbackControls.next();
				next();
			});

			router.on("!player/fullscreen", function(err, req, next) {
				dom.$("#player").classList.toggle("fullscreen");
				prepareFade();
				next();
			});

			return rendered;
		},

		public: {
			/* Register track provider */
			register: function(name, provider) {
				trackProviders[name] = provider;
			},


			/* Clear current playlist */
			clear: function() {
				stopCurrentTrack();
				playlist.forEach(function(track) { track.dispose(); });
				playlist = [];
				playlistIndex = -1;
			},


			/* Enqueue new track(s) either next to current track (next=true) or at the end of current playlist */
			enqueue: function(trackdefs, next) {
				var position = next ? playlistIndex + 1 : playlist.length;

				if (!Array.isArray(trackdefs)) {
					trackdefs = [trackdefs];
				}

				if (next && playlistIndex + 1 < playlist.length) {
					// Stop loading next track, if any
					playlist[playlistIndex + 1].stopLoading();
				}

				playlist.splice.bind(playlist, position, 0).apply(null, trackdefs.map(getTrack));

				if (next && playing) {
					// Start loading first new track
					playlist[playlistIndex + 1].load();
				}

				if (playlistIndex === -1) {
					playlistIndex = 0;
				}
			},


			/* Start playing current playlist
			   - if position is specified, play the position-th track from start
			   - else, if paused in a track, resume this track playback
			   - else, play current track or first track from the start
			 */
			play: function(position) {
				if (typeof position !== "undefined") {
					playTrack(position, true);
				} else if (playing) {
					playbackControls.play();
				} else if (playlist.length) {
					playTrack(playlistIndex);
				}
			}
		}
	};
});