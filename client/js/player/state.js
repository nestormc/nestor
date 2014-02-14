/*jshint browser:true*/
/*global define*/

/**
 * Player state logic
 *
 * Handles track playback, playlist logic, play order, saving/restoring player state.
 * Dispatches signals for use by the UI, and provides a public interface  to handle UI actions.
 */

define(["when", "storage", "player/providers"], function(when, storage, providers) {
	"use strict";

	/* State variables */
	var playlist = [];
	var playOrder = [];
	var playIndex = -1;
	var currentTime = 0;
	var playing = false;
	var repeat = false;
	var random = false;


	/* arraySplice(arr, i, n, [a, b, c, ...]) === arr.splice(i, n, a, b, c, ...) */
	function arraySplice(dest, startIndex, howMany, newItems) {
		newItems = newItems || [];
		return dest.splice.bind(dest, startIndex, howMany).apply(null, newItems);
	}

	/* Clamp index to playlist length */
	function clamp(index) {
		return (index + playOrder.length) % playOrder.length;
	}


	/* Save state in local storage */
	function saveState() {
		storage.set("player/state", JSON.stringify({
			playlist: playlist.map(function(t) { return { provider: t._provider, id: t._id }; }),
			playOrder: playOrder,
			playIndex: playIndex,
			currentTime: currentTime,
			playing: playing,
			repeat: repeat,
			random: random,
		}));
	}


	/* Play order updater
       
       When just toggled random playback, to either randomize or flatten play order.
       In this case, call with no arguments.
	   
	   When just enqueued new tracks in playlist, pass the indices of enqueued tracks
	   and a boolean indicating whether those are expected to play next.
	 */
	function updatePlayOrder(indices, next) {
		var chosenIndex;

		if (indices) {
			if (next) {
				// Insert indices next to current track
				arraySplice(playOrder, playIndex + 1, 0, indices);
			} else if (random) {
				// Insert indices randomly after current track
				while(indices.length) {
					chosenIndex = indices.splice(Math.floor(Math.random() * indices.length), 1)[0];
					playOrder.splice(playIndex + 1, 0, chosenIndex);
				}
			} else {
				// Add indices at end of play order
				arraySplice(playOrder, playOrder.length, 0, indices);
			}
		} else {
			indices = playlist.map(function(t, i) { return i; });

			var currentIndex = playOrder[playIndex];

			if (random) {
				playOrder = indices.splice(indices.indexOf(currentIndex), 1);

				while (indices.length) {
					chosenIndex = indices.splice(Math.floor(Math.random() * indices.length), 1)[0];
					playOrder.push(chosenIndex);
				}
			} else {
				playOrder = indices;
			}

			playIndex = playOrder.indexOf(currentIndex);
		}
	}


	/* Update playing status */
	function setPlayingStatus(status) {
		playing = status;
		state.playingChanged.dispatch(playing);
	}


	/* Stop current track */
	function stopCurrentTrack() {
		if (playIndex !== -1) {
			var current = playlist[playOrder[playIndex]];

			current.pause();

			current.loaded.removeAll();
			current.playable.removeAll();
			current.ended.removeAll();
			current.timeChanged.removeAll();
			current.lengthChanged.removeAll();
		}
	}


	/* Play track at specific playorder index */
	function playTrack(index, fromStart) {
		stopCurrentTrack();

		index = clamp(index);
		playIndex = index;
		setPlayingStatus(true);
		saveState();

		var track = playlist[playOrder[playIndex]];

		// Add length handler
		if (track.lengthChanged.getNumListeners() === 0) {
			track.lengthChanged.add(function(length) {
				state.lengthChanged.dispatch(length);
			});
		}

		// Ensure track started loading
		track.load();

		// Start loading next track when this one is done
		track.loaded.addOnce(function() {
			if (playIndex + 1 < playOrder.length) {
				playlist[playOrder[playIndex + 1]].load();
			}
		});

		if (fromStart) {
			track.seek(0);
			state.timeChanged.dispatch(0);
		}

		// Add time handler
		if (track.timeChanged.getNumListeners() === 0) {
			track.timeChanged.add(function(time) {
				currentTime = time;
				state.timeChanged.dispatch(time);
				saveState();
			});
		}

		// Start playback as soon as possible
		track.playable.addOnce(function() {
			track.play();
		});

		// Play next track when this one is done playing
		track.ended.addOnce(function() {
			if (playIndex + 1 < playOrder.length) {
				playTrack(playIndex + 1, true);
			} else if (repeat) {
				playTrack(0, true);
			} else {
				setPlayingStatus(false);
				saveState();
			}
		});

		state.trackChanged.dispatch(track);
	}


	var state = {
		/* Initialize signals */
		init: function(ui) {
			this.playingChanged = ui.signal();
			this.trackChanged = ui.signal();
			this.timeChanged = ui.signal();
			this.lengthChanged = ui.signal();
			this.repeatChanged = ui.signal();
			this.randomChanged = ui.signal();
			this.playlistChanged = ui.signal();
		},

		/* Restore saved state */
		load: function() {
			var loaded = JSON.parse(storage.get("player/state", "{}"));

			playlist = (loaded.playlist || []).map(providers.getTrack);
			playOrder = loaded.playOrder || [];
			playIndex = loaded.playIndex || -1;
			currentTime = loaded.currentTime || 0;
			playing = loaded.playing || false;
			repeat = loaded.repeat || false;
			random = loaded.random || false;

			this.repeatChanged.dispatch(repeat);
			this.randomChanged.dispatch(random);
			this.playingChanged.dispatch(playing);

			var newTrack;
			if (playIndex !== -1) {
				newTrack = playlist[playOrder[playIndex]];
				newTrack.seek(currentTime);

				if (playing) {
					this.play();
				}
			}

			this.trackChanged.dispatch(newTrack);
		},

		/* Force dispatching playlistChanged */
		updatePlaylist: function() {
			when.all(playlist.map(function(t, i) {
				return t.metadata.then(function(m) {
					m.position = t._position;
					return m;
				});
			})).then(function(playlist) {
				state.playlistChanged.dispatch(playlist);
			});
		},

		/* Toggle repeat full playlist */
		toggleRepeat: function() {
			repeat = !repeat;
			saveState();

			this.repeatChanged.dispatch(repeat);
		},

		/* Toggle random playback */
		toggleRandom: function() {
			random = !random;
			updatePlayOrder();
			saveState();

			this.randomChanged.dispatch(random);
		},

		/* Skip to next track in play order */
		next: function() {
			if (playOrder.length) {
				if (playing) {
					playTrack(playIndex + 1, true);
				} else {
					playIndex = clamp(playIndex + 1);
					var newTrack = playlist[playOrder[playIndex]];
				
					state.trackChanged.dispatch(newTrack);
					
					newTrack.seek(0);
					state.timeChanged.dispatch(0);
				}
			}
		},

		/* Restart current track or revert to previous track in play order */
		prev: function() {
			if (playOrder.length) {
				if (playing) {
					playTrack(playIndex - 1, true);
				} else {
					playIndex = clamp(playIndex - 1);
					var newTrack = playlist[playOrder[playIndex]];
				
					state.trackChanged.dispatch(newTrack);

					newTrack.seek(0);
					state.timeChanged.dispatch(0);
				}
			}
		},

		/* Start or resume playback
		   - if playlistIndex is specified, play that track from the start
		   - else, resume current playback, or start playing playlist in play order 
		 */
		play: function(playlistIndex) {
			if (playOrder.length) {
				if (typeof playlistIndex !== "undefined") {
					playTrack(playOrder.indexOf(playlistIndex), true);
				} else {
					playTrack(playIndex);
				}
			}
		},

		/* Pause playback */
		pause: function() {
			if (playOrder.length) {
				playlist[playOrder[playIndex]].pause();
				setPlayingStatus(false);
				saveState();
			}
		},

		/* Seek to specific timestamp in current track */
		seek: function(time) {
			if (playOrder.length) {
				playlist[playOrder[playIndex]].seek(time);
			}
		},

		/* Clear playlist */
		clear: function() {
			stopCurrentTrack();
			setPlayingStatus(false);

			playlist.forEach(function(track) { track.dispose(); });
			playlist = [];
			playOrder = [];
			playIndex = -1;

			saveState();
		},

		/* Enqueue track(s) next to current track or at end of playlist */
		enqueue: function(trackdefs, next) {
			if (!Array.isArray(trackdefs)) {
				trackdefs = [trackdefs];
			}

			// Save current track if applicable
			var currentTrack;
			if (playIndex !== -1) {
				currentTrack = playlist[playOrder[playIndex]];
			}

			// Insert new tracks in playlist
			var position = next ? playOrder[playIndex] + 1 : playOrder.length;
			arraySplice(playlist, position, 0, trackdefs.map(providers.getTrack));

			// Shift playlist indices in play order to account for insertion
			playOrder = playOrder.map(function(playlistIndex) {
				return playlistIndex >= position ? playlistIndex + trackdefs.length : playlistIndex;
			});

			// Update play index to match current track
			if (currentTrack) {
				playIndex = playOrder.indexOf(playlist.indexOf(currentTrack));
			} else {
				playIndex = 0;
			}

			// Update play order
			updatePlayOrder(trackdefs.map(function(t, i) { return position + i; }), next);

			// Dispatch playlist changed
			this.updatePlaylist();

			saveState();
		}
	};


	return state;
});