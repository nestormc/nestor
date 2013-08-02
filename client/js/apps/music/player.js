/*jshint browser:true */
/*global require, define, $, $$ */

define(["ist!tmpl/music/player", "ui"], function(template, ui) {
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

		audio.addEventListener("canplaythrough", trackLoaded.bind(null, audio, player, audio));
		audio.addEventListener("ended", trackEnded.bind(null, audio, player));
		audio.addEventListener("timeupdate", trackTimeUpdate.bind(null, audio, player));
		audio.addEventListener("progress", trackTimeUpdate.bind(null, audio, player));

		return audio;
	}


	function trackLoaded(track, player, originalTrack) {
		var tracks = player.tracks,
			index = tracks.indexOf(track);

		// Mark this one as loaded
		track.isLoaded = true;

		// Find next track in playlist
		var next = tracks[index + 1] || tracks[0];

		if (next === originalTrack) {
			// Next is the original triggering track, stop here
			return;
		}

		// Trigger preload on next track
		next.preload = "auto";

		if (next.isLoaded) {
			// Already loaded, make it trigger the next one
			trackLoaded.call(null, next, player, originalTrack);
		}
	}


	function trackEnded(track, player) {
		var tracks = player.tracks,
			index = tracks.indexOf(track),
			next = tracks[index + 1];

		if (next) {
			next.play();
		}
	}

	function trackTimeUpdate(track, player) {
		player.updateTrackInfo(track);
	}

	function playerBehaviour(player) {
		return {
			"a.play": {
				"click": function(e) {
					e.preventDefault();

					this.innerText = player.togglePlay() ? "pause" : "play";

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
			}
		};
	}


	return {
		render: function(ui) {
			this.rendered = template.render();
			ui.behave(this.rendered, playerBehaviour(this));
			return this.rendered;
		},

		playing: -1,
		tracks: [],
		
		empty: function() {
			this.tracks.forEach(function(track) {
				track.pause();
				track.preload = "none";
				track.src = "";
			});

			this.tracks = [];
		},

		enqueue: function(element, position) {
			var track = createAudioTrack(this);
			track.data = element.dataset;
			track.src = element.dataset.file;

			if (this.tracks.filter(function(t) { return !t.isLoaded; }).length === 0) {
				// All other tracks are already loaded, trigger loading of this track
				track.preload = "auto";
			}

			if (typeof position !== "undefined") {
				this.tracks.splice(position, 0, [track]);
			} else {
				this.tracks.push(track);
			}
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

			track.preload = "auto";

			// Try to rewind, will fail if not yet loaded
			try {
				track.currentTime = 0;
			} catch(e) {}

			track.play();
			this.playing = index || 0;
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
			} else {
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
				loaded = Math.floor(audio.buffered.end(audio.buffered.length - 1));


			$("#player .elapsed").innerText = audio ? humanTime(current) : "-";
			$("#player .total").innerText = audio ? humanTime(total) : "-";
			$("#player .bar").style.width = Math.floor(100 * current / total) + "%";
			$("#player .loadbar").style.width = Math.floor(100 * loaded / total) + "%";
			$("#player .artist").innerText = audio ? audio.data.artist  : "-";
			$("#player .track").innerText = audio ? audio.data.title  : "-";
		}
	};
});
