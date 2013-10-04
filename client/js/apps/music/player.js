/*jshint browser:true */
/*global define */

define([
	"ui", "storage", "dom", "router",

	"resources",
	"track",

	"ist!templates/player",
	"ist!templates/tempPlaylist"
], function(
	ui, storage, dom, router,

	resources,
	createAudioTrack,

	template, playlistTemplate
) {
	"use strict";

	var // Time threshold to switch to previous track
		PREV_THRESHOLD = 4,
		$ = dom.$;


	function humanTime(duration) {
		var hours = Math.floor(duration / 3600),
			minutes = Math.floor(duration % 3600 / 60),
			seconds = Math.floor(duration) % 60;
		
		return hours === 0 ? minutes + ":" + (seconds > 9 ? seconds : "0" + seconds)
						   : hours + "h" + (minutes > 9 ? minutes : "0" + minutes) + "m" + (seconds > 9 ? seconds : "0" + seconds) + "s";
	}

	function playerBehaviour(player) {
		return {
			".cover": {
				"error": function() {
					this.src = "images/nocover.svg";
				}
			},

			".progress": {
				"mousedown": function(e) {
					e.preventDefault();

					this.seeking = true;

					var offset = e.offsetX;

					if (e.toElement !== this) {
						offset += e.toElement.offsetLeft;
					}

					player.seekTo(offset / this.offsetWidth);


					return false;
				},

				"mousemove": function(e) {
					e.preventDefault();

					if (this.seeking) {
						var offset = e.offsetX;

						if (e.toElement !== this) {
							offset += e.toElement.offsetLeft;
						}

						player.seekTo(offset / this.offsetWidth);
					}

					return false;
				},

				"mouseup": function(e) {
					e.preventDefault();

					this.seeking = false;

					return false;
				}
			}
		};
	}


	function emptyPlaylist(player) {
		player.tracks.forEach(function(track) {
			track.dispose();
		});

		player.playing = -1;
		player.tracks = [];
	}


	function enqueueTrack(player, element, position) {
		var track = createAudioTrack(player, element);
		track.trackLoaded.add(preloadNextTrack.bind(null, player));

		if (typeof position !== "undefined") {
			player.tracks.splice(position, 0, track);
		} else {
			player.tracks.push(track);
		}

		preloadNextTrack(player);
	}


	function preloadNextTrack(player) {
		if (player.playing === -1) {
			// Not playing, no need to load tracks
			return;
		}

		if (player.tracks.some(function(track) { return track.isLoading; })) {
			// A track is already loading, loadNext will be called again when it has finished
			return;
		}

		// Load next track from currently playing track
		for (var i = player.playing + 1, len = player.tracks.length; i < len; i++) {
			var track = player.tracks[i];

			if (!track.isLoaded) {
				track.isLoading = true;
				track.load();
				return;
			}
		}
	}


	function stopPlayback(player) {
		storage.set("player/playingTrack", -1);
		player.playing = -1;
		player.updatePlayTime();
		player.currentTrackChanged.dispatch();
		player.playStateChanged.dispatch(false);
	}


	return {
		/* Render player applet */
		render: function() {
			var player = this;

			this.playlistResource = resources.playlists;
			this.rendered = template.render();
			dom.behave(this.rendered, playerBehaviour(this));

			/* Load state when applet is ready */
			ui.appletsReady.add(function() {
				var playlist = storage.get("player/playlist"),
					playing = Number(storage.get("player/playingTrack", -1)),
					currentTime = Number(storage.get("player/currentTime", 0));

				if (playlist) {
					resources.playlists.get(playlist)
					.then(function(data) {
						var elements = [].slice.call(playlistTemplate.render({ tracks: data.tracks }).childNodes);

						player.currentPlaylist = playlist;
						elements.forEach(function(element) {
							enqueueTrack(player, element);
						}, player);

						if (playing !== -1) {
							player.play(playing, currentTime, storage.get("player/playingState", "paused") === "paused");
						}

						player.currentPlaylistChanged.dispatch(playlist);
					});
				}
			});

			/* Dispose of all tracks and reset state when ui stops */
			ui.stopping.add(function() {
				player.tracks.forEach(function(track) {
					track.dispose();
				});

				player.tracks = [];
				player.playing = -1;
				player.currentPlaylist = "!floating";
			});

			this.playStateChanged.add(function(playing) {
				$("#player a.pause").style.display = playing ? "inline" : "none";
				$("#player a.play").style.display = playing ? "none" : "inline";
			});

			this.currentTrackChanged.add(function(id, audio) {
				player.updateTrackInfo(audio);
			});

			router.on("!togglePlay", function(err, req, next) {
				player.togglePlay();
				next();
			});

			router.on("!next", function(err, req, next) {
				player.next();
				next();
			});

			router.on("!prev", function(err, req, next) {
				player.prev();
				next();
			});

			return this.rendered;
		},

		/* Signals */
		currentTrackChanged: ui.signal(),
		currentPlaylistChanged: ui.signal(),
		trackLoadingFailed: ui.signal(),
		playStateChanged: ui.signal(),

		/* Current state */
		playing: -1,
		tracks: [],
		currentPlaylist: "!floating",


		/*!
		 * Playlist manipulation
		 */


		/*
		 * Add track to current playlist at specific position
		 *
		 * @param element DOM element with track data
		 * @param [position] track position, defaults to end of playlist
		 */
		enqueue: function(element, position) {
			enqueueTrack(this, element, position);
			this.playlistResource.addTrack(this.currentPlaylist, element, position || this.tracks.length);
		},


		/*
		 * Remove track from current playlist
		 *
		 * @param element DOM element with track data
		 */
		remove: function(element) {
			var filtered = this.tracks.filter(function(track) {
					return track.data.id === element.data.id;
				}),
				track = filtered[0];

			if (track) {
				var index = this.tracks.indexOf(track);
				if (index !== -1) {
					if (index === this.playing) {
						stopPlayback(this);
					}

					this.tracks.splice(index, 1);
					track.dispose();
					preloadNextTrack(this);

					// TODO remove from db
				}
			}
		},


		/*
		 * Replace playlist content with trackset
		 *
		 * @param elements array of DOM elements with track data
		 * @param [name] playlist name, defaults to "!floating"
		 */
		replace: function(elements, name) {
			name = name || "!floating";
			this.currentPlaylist = name;

			this.currentPlaylistChanged.dispatch(name);

			emptyPlaylist(this);
			elements.forEach(function(element) {
				enqueueTrack(this, element);
			}, this);

			// No need to save if replacing from named playlist
			if (name === "!floating") {
				this.playlistResource.replaceTracks(name, elements);
			}

			storage.set("player/playlist", name);
		},


		/*
		 *! Player controls
		 */

		/* Play track in current playlist at specified index, starting at specified time */
		play: function(index, time, seekOnly) {
			var track = this.tracks[index || 0];

			if (this.playing >= 0) {
				this.tracks[this.playing].pause();
			}

			this.playing = index || 0;
			storage.set("player/playingTrack", this.playing);
			storage.set("player/playingState", seekOnly ? "paused" : "playing");

			track.requestedCurrentTime = time || 0;
			track.requestedSeekOnly = seekOnly;

			if (!track.isPlayable) {
				// Track is not playable yet

				if (!track.isLoading) {
					// It's not even loading, trigger that at least
					track.isLoading = true;
					track.load();
				}

				// Track will begin playback when receiving its canplay event
			} else {
				// Track is playable right now
				track.currentTime = time || 0;

				if (!seekOnly) {
					track.play();
				}

				preloadNextTrack(this);
			}

			this.playStateChanged.dispatch(!seekOnly);
			this.currentTrackChanged.dispatch(track.data.id, track);
		},

		/* Toggle play/pause */
		togglePlay: function() {
			if (this.playing >= 0) {
				var track = this.tracks[this.playing];

				if (track.paused) {
					storage.set("player/playingState", "playing");
					track.play();
					this.playStateChanged.dispatch(true);
				} else {
					storage.set("player/playingState", "paused");
					track.pause();
					this.playStateChanged.dispatch(false);
				}
			} else if (this.tracks.length) {
				this.play();
			}
		},

		/* Switch to next track */
		next: function() {
			if (this.playing >= 0 && this.playing < this.tracks.length - 1) {
				this.play(this.playing + 1);
			}
		},

		/* Switch to previous track or start of current track if currentTime < PREV_THRESHOLD */
		prev: function() {
			if (this.playing >= 0) {
				var currentTrack = this.tracks[this.playing];

				if (this.playing > 0 && currentTrack.currentTime < PREV_THRESHOLD) {
					this.play(this.playing - 1);
				} else {
					currentTrack.currentTime = 0;
				}
			}
		},

		/* Seek to fractional position in current track (frac = [0..1[) */
		seekTo: function(frac) {
			if (this.playing >= 0) {
				var track = this.tracks[this.playing];

				track.currentTime = track.duration * frac;
			}
		},

		/* Update playing track */
		updateTrackInfo: function(audio) {
			if (this.playing !== this.tracks.indexOf(audio)) {
				// This is not the current track
				return;
			}

			$("#player .cover").src = audio ? "/rest/covers/album:" + audio.data.artist + ":" + audio.data.album : "";
			$("#player .artist").innerText = audio ? audio.data.artist  : "-";
			$("#player .track").innerText = audio ? audio.data.title  : "-";
		},


		/* Update playing time */
		updatePlayTime: function(audio) {
			var current, total;

			if (this.playing !== this.tracks.indexOf(audio)) {
				// This is not the current track
				return;
			}

			if (audio) {
				storage.set("player/currentTime", audio.currentTime);
				current = Math.floor(audio.currentTime);
				total = Math.floor(audio.duration);
			}

			$("#player .elapsed").innerText = audio ? humanTime(current) : "-";
			$("#player .total").innerText = audio ? humanTime(total) : "-";
			$("#player .bar").style.width = audio ? Math.floor(100 * current / total) + "%" : 0;
		}
	};
});
