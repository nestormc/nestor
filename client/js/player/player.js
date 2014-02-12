/*jshint browser: true*/
/*global define*/

define(
["ist!tmpl/player", "components/index", "dom", "router", "storage"],
function(template, components, dom, router, storage) {
	"use strict";

	var playlist = [];
	var playing = false;
	var playlistIndex = -1;

	var trackProviders = {};


	function clamp(index) {
		return (index + playlist.length) % playlist.length;
	}


	function setPlayingStatus(status) {
		playing = status;
		storage.set("player/playing", status);

		dom.$("#player .play").style.display = status ? "none" : "inline-block";
		dom.$("#player .pause").style.display = status ? "inline-block" : "none";
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


	function updateCurrentMetadata() {
		var title = "";
		var subtitle = "";
		
		dom.$("#player .metadata .title").innerHTML = "...";
		dom.$("#player .metadata .subtitle").innerHTML = "";

		if (playlistIndex !== -1) {
			playlist[playlistIndex].metadata.then(function(meta) {
				dom.$("#player .metadata .title").innerHTML = meta.title || "";
				dom.$("#player .metadata .subtitle").innerHTML = meta.subtitle || "";
			});
		}
	}


	function playTrack(index, fromStart) {
		stopCurrentTrack();

		index = clamp(index);
		var track = playlist[index];

		playlistIndex = index;
		setPlayingStatus(true);

		storage.set("player/index", playlistIndex);

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
				storage.set("player/time", time);
				dom.$("#player .slider").setValue(time);
			});
		}

		// Start playback as soon as possible
		track.playable.addOnce(function() {
			updateCurrentMetadata();

			track.display.then(function(display) {
				display.classList.add("track-display");
				dom.$("#player .display").appendChild(display);
				track._display = display;
			});

			track.play();
		});

		// Play next track when this one is done playing
		track.ended.addOnce(function() {
			if (playlistIndex + 1 < playlist.length) {
				playTrack(playlistIndex + 1, true);
			} else {
				setPlayingStatus(false);
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
				
				updateCurrentMetadata();
				dom.$("#player .slider").setValue(0);
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
				
				updateCurrentMetadata();
				dom.$("#player .slider").setValue(0);
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
				setPlayingStatus(false);
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


	var player = {
		render: function(ui) {
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

			ui.started.add(function() {
				// Restore saved status
				playlist = JSON.parse(storage.get("player/playlist", "[]")).map(getTrack);
				playlistIndex = JSON.parse(storage.get("player/index", "-1"));

				updateCurrentMetadata();

				var time = JSON.parse(storage.get("player/time", "0"));
				playbackControls.seek(time);

				if (playlist.length) {
					var track = playlist[playlistIndex];

					track.lengthChanged.add(function(length) {
						dom.$("#player .slider").setRange(length);
						dom.$("#player .slider").setAvailable(length);
						dom.$("#player .slider").setValue(time);
					});

					track.load();
				}

				if (JSON.parse(storage.get("player/playing", "false"))) {
					playbackControls.play();
				}
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
				setPlayingStatus(false);
				playlist.forEach(function(track) { track.dispose(); });
				playlist = [];
				playlistIndex = -1;

				storage.set("player/index", playlistIndex);
				storage.set("player/playlist", "[]");
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

				storage.set("player/index", playlistIndex);
				storage.set("player/playlist", JSON.stringify(playlist.map(function(track) {
					return { provider: track._provider, id: track._id };
				})));
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

	return player;
});