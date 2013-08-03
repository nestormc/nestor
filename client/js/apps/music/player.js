/*jshint browser:true */
/*global require, define, $, $$ */

define(["ist!tmpl/music/player", "signals", "ui"], function(template, signals, ui) {
	"use strict";

	function humanTime(duration) {
		var hours = Math.floor(duration / 3600),
			minutes = Math.floor(duration % 3600 / 60),
			seconds = Math.floor(duration) % 60;
		
		return hours == 0 ? minutes + ":" + (seconds > 9 ? seconds : "0" + seconds)
						  : hours + "h" + (minutes > 9 ? minutes : "0" + minutes) + "m" + (seconds > 9 ? seconds : "0" + seconds) + "s";
	}


	function createAudioTrack(player) {
		var audio = new Audio();

		audio.preload = "none";
		audio.autoplay = false;
		audio.isLoaded = false;

		audio.addEventListener("canplay", trackPlayable.bind(null, audio, player));
		audio.addEventListener("canplaythrough", trackLoaded.bind(null, audio, player));
		audio.addEventListener("ended", trackEnded.bind(null, audio, player));
		audio.addEventListener("timeupdate", trackTimeUpdate.bind(null, audio, player));
		audio.addEventListener("progress", trackTimeUpdate.bind(null, audio, player));

		return audio;
	}


	function trackPlayable(track, player) {
		var index = player.tracks.indexOf(track);

		track.isPlayable = true;

		// Start playing if player wants to play this track
		if (player.playing === index) {
			track.currentTime = 0;
			track.play();
		}
	}


	function trackLoaded(track, player) {
		track.isLoaded = true;
		track.isLoading = false;

		// Enable player to preload the next track
		player.loadNext();
	}


	function trackEnded(track, player) {
		var tracks = player.tracks,
			index = tracks.indexOf(track);

		if (index !== tracks.length - 1) {
			player.play(index + 1);
		}
	}

	function trackTimeUpdate(track, player) {
		player.updateTrackInfo(track);
	}

	function playerBehaviour(player) {
		return {
			"img.play": {
				"click": function(e) {
					e.preventDefault();

					this.src = player.togglePlay() ? "images/pause.svg" : "images/play.svg";

					return false;
				}
			},
			"img.prev": {
				"click": function(e) {
					e.preventDefault();
					player.prev();

					return false;
				}
			},
			"img.next": {
				"click": function(e) {
					e.preventDefault();
					player.next();

					return false;
				}
			},
			".progress": {
				"click": function(e) {
					e.preventDefault();
					player.seekTo(e.offsetX / this.offsetWidth);

					return false;
				}
			}
		};
	}


	return {
		render: function(ui) {
			this.rendered = template.render();
			ui.behave(this.rendered, playerBehaviour(this));

			return this.rendered;
		},

		currentTrackChanged: new signals.Signal(),

		playing: -1,
		tracks: [],
		
		empty: function() {
			this.tracks.forEach(function(track) {
				track.pause();
				track.preload = "none";
				track.src = "";
			});

			this.playing = -1;
			this.tracks = [];
		},

		loadNext: function() {
			if (this.playing === -1) {
				// Not playing, no need to load tracks
				return;
			}

			if (this.tracks.some(function(track) { return track.isLoading; })) {
				// A track is already loading, loadNext will be called again when it has finished
				return;
			}

			// Load next unloaded track from currently playing track
			for (var i = this.playing + 1, len = this.tracks.length; i < len; i++) {
				var track = this.tracks[i];

				if (!track.isLoaded) {
					track.isLoading = true;
					track.load();
					return;
				}
			}
		},

		enqueue: function(element, position) {
			var track = createAudioTrack(this);
			track.data = element.dataset;
			track.src = element.dataset.file;

			if (typeof position !== "undefined") {
				this.tracks.splice(position, 0, track);
			} else {
				this.tracks.push(track);
			}

			this.loadNext();
		},

		replace: function(elements) {
			this.empty();

			elements.forEach(function(element) {
				this.enqueue(element);
			}, this);
		},

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

				this.loadNext();
			}

			this.currentTrackChanged.dispatch(track.data.id);
		},

		togglePlay: function() {
			if (this.playing >= 0) {
				var track = this.tracks[this.playing];

				if (track.paused) {
					track.play();
					return true;
				} else {
					track.pause();
					return false;
				}
			} else if (this.tracks.length) {
				this.play();
				return true;
			}
		},

		next: function() {
			if (this.playing >= 0 && this.playing < this.tracks.length - 1) {
				this.play(this.playing + 1);
			}
		},

		prev: function() {
			if (this.playing > 0) {
				this.play(this.playing - 1);
			}
		},

		updateTrackInfo: function(audio) {
			if (this.playing !== this.tracks.indexOf(audio)) {
				// This is not the current track
				return;
			}

			var current = Math.floor(audio.currentTime),
				total = Math.floor(audio.duration),
				loaded = audio.buffered.length ? Math.floor(audio.buffered.end(audio.buffered.length - 1)) : 0;


			$("#player .elapsed").innerText = audio ? humanTime(current) : "-";
			$("#player .total").innerText = audio ? humanTime(total) : "-";
			$("#player .bar").style.width = Math.floor(100 * current / total) + "%";
			$("#player .loadbar").style.width = Math.floor(100 * loaded / total) + "%";
			$("#player .artist").innerText = audio ? audio.data.artist  : "-";
			$("#player .track").innerText = audio ? audio.data.title  : "-";
		},

		seekTo: function(frac) {
			if (this.playing >= 0) {
				var track = this.tracks[this.playing];

				track.currentTime = track.duration * frac;
			}
		}
	};
});
