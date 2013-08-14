/*jshint browser:true */
/*global require, define, $, $$ */

define([
	"signals", "ui",

	"resources",
	"track",

	"ist!templates/player"
], function(
	signals, ui,

	resources,
	createAudioTrack,

	template
) {
	"use strict";

	var // Time threshold to switch to previous track
		PREV_THRESHOLD = 4;


	function humanTime(duration) {
		var hours = Math.floor(duration / 3600),
			minutes = Math.floor(duration % 3600 / 60),
			seconds = Math.floor(duration) % 60;
		
		return hours === 0 ? minutes + ":" + (seconds > 9 ? seconds : "0" + seconds)
						   : hours + "h" + (minutes > 9 ? minutes : "0" + minutes) + "m" + (seconds > 9 ? seconds : "0" + seconds) + "s";
	}

	function playerBehaviour(player) {
		return {
			"a.play": {
				"click": function(e) {
					e.preventDefault();
					player.togglePlay();

					return false;
				}
			},
			"a.prev": {
				"click": function(e) {
					e.preventDefault();
					player.prev();

					return false;
				}
			},
			"a.next": {
				"click": function(e) {
					e.preventDefault();
					player.next();

					return false;
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

		// Load next unloaded track from currently playing track
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
		player.playing = -1;
		player.updateTrackInfo();
		player.currentTrackChanged.dispatch();
		player.playStateChanged.dispatch(false);
	}


	return {
		/* Render player applet */
		render: function() {
			this.playlistResource = resources.playlists;
			this.rendered = template.render();
			ui.behave(this.rendered, playerBehaviour(this));

			this.playStateChanged.add(function(playing) {
				$("#player a.play img").src = playing ? "images/pause.svg" : "images/play.svg";
			});

			return this.rendered;
		},

		/* Signals */
		currentTrackChanged: new signals.Signal(),
		trackLoadingFailed: new signals.Signal(),
		playStateChanged: new signals.Signal(),

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
			this.currentPlaylist = name || "!floating";

			emptyPlaylist(this);
			elements.forEach(function(element) {
				enqueueTrack(this, element);
			}, this);

			this.playlistResource.replaceTracks(this.currentPlaylist, elements);
		},


		/*
		 *! Player controls
		 */

		/* Play track in current playlist at specified index */
		play: function(index) {
			var track = this.tracks[index || 0];

			if (this.playing >= 0) {
				this.tracks[this.playing].pause();
			}

			this.playing = index || 0;

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
				track.currentTime = 0;
				track.play();

				preloadNextTrack(this);
			}

			this.playStateChanged.dispatch(true);
			this.currentTrackChanged.dispatch(track.data.id);
		},

		/* Toggle play/pause */
		togglePlay: function() {
			if (this.playing >= 0) {
				var track = this.tracks[this.playing];

				if (track.paused) {
					track.play();
					this.playStateChanged.dispatch(true);
				} else {
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

		/* Update track title and playing time */
		updateTrackInfo: function(audio) {
			var current, total;

			if (this.playing !== this.tracks.indexOf(audio)) {
				// This is not the current track
				return;
			}

			if (audio) {
				current = Math.floor(audio.currentTime);
				total = Math.floor(audio.duration);
			}


			$("#player .elapsed").innerText = audio ? humanTime(current) : "-";
			$("#player .total").innerText = audio ? humanTime(total) : "-";
			$("#player .bar").style.width = audio ? Math.floor(100 * current / total) + "%" : 0;
			$("#player .artist").innerText = audio ? audio.data.artist  : "-";
			$("#player .track").innerText = audio ? audio.data.title  : "-";
		}
	};
});
