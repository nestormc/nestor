/*jshint browser: true*/
/*global define*/

define(
["ist!tmpl/player", "ist!tmpl/playlist", "components/index", "dom", "router", "player/state", "player/providers", "player/fullscreen"],
function(playerTemplate, playlistTemplate, components, dom, router, state, providers, fullscreen) {
	"use strict";

	function humanTime(duration) {
		var hours = Math.floor(duration / 3600),
			minutes = Math.floor(duration % 3600 / 60),
			seconds = Math.floor(duration) % 60;
		
		return hours === 0 ? minutes + ":" + (seconds > 9 ? seconds : "0" + seconds)
						   : hours + "h" + (minutes > 9 ? minutes : "0" + minutes) + "m" + (seconds > 9 ? seconds : "0" + seconds) + "s";
	}

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

			if (playing) {
				dom.$("#player .display .status .playing").classList.add("visible");
				dom.$("#player .display .status .paused").classList.remove("visible");
			} else {
				dom.$("#player .display .status .playing").classList.remove("visible");
				dom.$("#player .display .status .paused").classList.add("visible");
			}
		});

		state.lengthChanged.add(function(length) {
			dom.$("#player .slider").setRange(length);
			dom.$("#player .slider").setAvailable(length);
			dom.$("#player .time .total").innerHTML = humanTime(length);
		});

		state.timeChanged.add(function(time) {
			dom.$("#player .slider").setValue(time);
			dom.$("#player .time .current").innerHTML = humanTime(time);
		});

		state.trackChanged.add(function(track) {
			dom.$("#player .metadata .title").innerHTML = " ";
			dom.$("#player .metadata .subtitle").innerHTML = " ";

			var playlistView = ui.view("playlist");

			if (playlistView.$(".playing")) {
				playlistView.$(".playing").classList.remove("playing");
			}

			if (track) {
				var trackElement = playlistView.$(".track[data-position=\"" + track._position + "\"");
				
				if (trackElement) {
					trackElement.classList.add("playing");
				}

				track.metadata.then(function(meta) {
					dom.$("#player .metadata .title").innerHTML = meta.title || " ";
					dom.$("#player .metadata .subtitle").innerHTML = meta.subtitle || " ";

					if (meta.length) {
						state.lengthChanged.dispatch(meta.length);
					}
				});

				track.display.then(function(display) {
					var currentDisplay = dom.$("#player .display .track-display");
					if (display !== currentDisplay) {
						if (currentDisplay) {
							currentDisplay.parentNode.removeChild(currentDisplay);
						}

						display.classList.add("track-display");
						dom.$("#player .display").insertBefore(display, dom.$("#player .display .status"));
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

	fullscreen.exited.add(function() {
		dom.$("#player").classList.remove("fullscreen");
	});

	var playerBehaviour = {
		".display": {
			"mousemove": function() {
				dom.$("#player").classList.remove("fade");
				dom.$("#player .slider").classList.remove("one-pixel");

				if (fadeTimeout) {
					clearTimeout(fadeTimeout);
				}

				prepareFade();
			},

			"click": function() {
				state.togglePlay();
			},

			"dblclick": function() {
				dom.$("#player").classList.toggle("fullscreen");

				if (dom.$("#player").classList.contains("fullscreen")) {
					fullscreen.enter(dom.$("#player"));
				} else {
					fullscreen.exit();
				}
			}
		}
	};


	var manifest = {
		name: "player",
		views: {
			playlist: {
				type: "main",
				css: "playlist"
			}
		},

		render: function() {
			/* Render player */
			var slider = components.slider();
			slider.setAvailable(1);
			slider.live = false;
			slider.changed.add(state.seek);

			var rendered = playerTemplate.render({
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

			var renderedPlaylist;
			var playlistView = ui.view("playlist");
			var playlistBinding;

			playlistView.displayed.add(function() {
				dom.$("#player .playlist").classList.add("active");

				if (!renderedPlaylist) {
					renderedPlaylist = playlistTemplate.render({ playlist: [] });
					playlistView.appendChild(renderedPlaylist);
				}

				playlistBinding = state.playlistChanged.add(function(playlist) {
					renderedPlaylist.update({ playlist: playlist });
				});

				state.updatePlaylist();
			});

			playlistView.undisplayed.add(function() {
				dom.$("#player .playlist").classList.remove("active");
				playlistBinding.detach();
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