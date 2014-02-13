/*jshint browser: true*/
/*global define*/

define(
["ist!tmpl/player", "components/index", "dom", "router", "player/state", "player/providers"],
function(template, components, dom, router, state, providers) {
	"use strict";
	/* Connect to player state */
	function initPlayerState(ui) {
		state.init(ui);

		state.repeatChanged.add(function(repeat) {
			dom.$("#player .repeat").classList[repeat ? "add" : "remove"]("active");
		});

		state.randomChanged.add(function(random) {
			dom.$("#player .random").classList[random ? "add" : "remove"]("active");
		});

		state.playingChanged.add(function(playing) {
			dom.$("#player .play").style.display = playing ? "none" : "inline-block";
			dom.$("#player .pause").style.display = playing ? "inline-block" : "none";
		});

		state.lengthChanged.add(function(length) {
			dom.$("#player .slider").setRange(length);
			dom.$("#player .slider").setAvailable(length);
		});

		state.timeChanged.add(function(time) {
			dom.$("#player .slider").setValue(time);
		});

		state.trackChanged.add(function(track) {
			dom.$("#player .metadata .title").innerHTML = "...";
			dom.$("#player .metadata .subtitle").innerHTML = "";

			if (track) {
				track.metadata.then(function(meta) {
					dom.$("#player .metadata .title").innerHTML = meta.title || "";
					dom.$("#player .metadata .subtitle").innerHTML = meta.subtitle || "";
				});

				track.display.then(function(display) {
					var currentDisplay = dom.$("#player .display .track-display");
					if (display !== currentDisplay) {
						if (currentDisplay) {
							currentDisplay.parentNode.removeChild(currentDisplay);
						}

						display.classList.add("track-display");
						dom.$("#player .display").appendChild(display);
					}
				});
			}
		});

		state.load();
	}


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


	var manifest = {
		name: "player",
		views: {

		},

		render: function() {
			/* Render player */
			var slider = components.slider();
			slider.setAvailable(1);
			slider.live = false;
			slider.changed.add(state.seek);

			var rendered = template.render({
				slider: slider,
				behaviour: playerBehaviour
			});

			return rendered;
		},

		startup: function(ui) {
			// Initialize player state
			initPlayerState(ui);

			// Setup action routes
			router.on("!player/play", function(err, req, next) {
				state.play();
				next();
			});

			router.on("!player/pause", function(err, req, next) {
				state.pause();
				next();
			});

			router.on("!player/next", function(err, req, next) {
				state.next();
				next();
			});

			router.on("!player/prev", function(err, req, next) {
				state.prev();
				next();
			});

			router.on("!player/random", function(err, req, next) {
				state.toggleRandom();
				next();
			});

			router.on("!player/repeat", function(err, req, next) {
				state.toggleRepeat();
				next();
			});

			router.on("!player/fullscreen", function(err, req, next) {
				dom.$("#player").classList.toggle("fullscreen");
				next();
			});
		},

		public: {
			/* Register track provider */
			register: function(name, provider) {
				providers.register(name, provider);
			},


			/* Clear current playlist */
			clear: function() {
				state.clear();
			},


			/* Enqueue new track(s) either next to current track (next=true) or at the end of current playlist */
			enqueue: function(trackdefs, next) {
				state.enqueue(trackdefs, next);
			},

			/* Start playing current playlist
			   - if position is specified, play the position-th track from start
			   - else, if paused in a track, resume this track playback
			   - else, play current track or first track from the start
			 */
			play: function(position) {
				state.play(position);
			}
		}
	};

	return manifest;
});