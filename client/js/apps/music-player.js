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

		var events = {
			"canplay": trackPlayable.bind(null, audio, player),
			"ended": trackEnded.bind(null, audio, player),
			"timeupdate": trackTimeUpdate.bind(null, audio, player),
			"progress": trackLoadProgress.bind(null, audio, player),
			"error": trackError.bind(null, audio, player)
		};

		Object.keys(events).forEach(function(event) {
			audio.addEventListener(event, events[event]);
		});

		audio.dispose = function() {
			Object.keys(events).forEach(function(event) {
				audio.removeEventListener(event, events[event]);
			});

			audio.pause();
			audio.preload = "none";
			audio.src = "";
		};

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
			player.updateTrackInfo();
			player.currentTrackChanged.dispatch();
			player.playStateChanged.dispatch(false);
		}
	}

	function trackLoadProgress(track, player) {
		if (track.isLoading && track.buffered.length) {
			if (Math.abs(track.buffered.end(track.buffered.length - 1) - track.duration) < 0.1) {
				// Track is loaded
				track.isLoaded = true;
				track.isLoading = false;

				player.loadNext();
			}
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
				"click": function(e) {
					e.preventDefault();

					var offset = e.offsetX;

					if (e.toElement !== this) {
						offset += e.toElement.offsetLeft;
					}

					player.seekTo(offset / this.offsetWidth);

					return false;
				}
			}
		};
	}


	return {
		render: function(ui) {
			this.rendered = template.render();
			ui.behave(this.rendered, playerBehaviour(this));

			this.playStateChanged.add(function(playing) {
				$("#player a.play img").src = playing ? "images/pause.svg" : "images/play.svg";
			});

			return this.rendered;
		},

		currentTrackChanged: new signals.Signal(),
		trackLoadingFailed: new signals.Signal(),
		playStateChanged: new signals.Signal(),

		playing: -1,
		tracks: [],
		
		empty: function() {
			this.tracks.forEach(function(track) {
				track.dispose();
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

			this.playStateChanged.dispatch(true);
			this.currentTrackChanged.dispatch(track.data.id);
		},

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
		},

		seekTo: function(frac) {
			if (this.playing >= 0) {
				var track = this.tracks[this.playing];

				track.currentTime = track.duration * frac;
			}
		}
	};
});
