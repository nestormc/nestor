/*jshint browser:true */
/*global require, define, $, $$ */

define(
[
	"when", "ist", "ui", "router",

	"player",
	"resources",

	"ist!templates/applet",
	"ist!templates/albumlist",
	"ist!templates/playlists"
],
function(
	when, ist, ui, router,

	player,
	resources,

	appletTemplate,
	albumlistTemplate,
	playlistsTemplate
) {
	"use strict";

	var music,
		albumlistContainer,
		albumlistBehaviour,
		playlistsContainer,
		playlistsBehaviour;

	albumlistBehaviour = {
		".albumlist": {
			/* Unselect tracks */
			"click": function(e) {
				e.preventDefault();

				albumlistContainer.$$(".selected").forEach(function(sel) {
					sel.classList.remove("selected");
				});

				return false;
			}
		},

		"li.track": {
			/* Prevent text selection when shift-clicking tracks */
			"mousedown": function(e) {
				e.preventDefault();
				return false;
			},

			/* Handle track selection with click, ctrl+click, shift+click */
			"click": (function() {
				var firstClicked;

				return function(e) {
					e.preventDefault();
					e.stopPropagation();

					if (!e.ctrlKey) {
						albumlistContainer.$$(".selected").forEach(function(sel) {
							sel.classList.remove("selected");
						});
					}

					if (e.shiftKey && firstClicked) {
						var tracks = albumlistContainer.$$("li.track"),
							idx1 = tracks.indexOf(firstClicked),
							idx2 = tracks.indexOf(this);

						tracks.slice(Math.min(idx1, idx2), Math.max(idx1, idx2) + 1).forEach(function(track) {
							track.classList.add("selected");
						});

						return false;
					}

					if (e.ctrlKey) {
						this.classList.add("selected");
						firstClicked = this;
						return false;
					}

					this.classList.add("selected");
					firstClicked = this;

					return false;
				};
			}()),

			"dblclick": function(e) {
				e.preventDefault();

				var tracks = albumlistContainer.$$(".selected"),
					index = tracks.indexOf(this);

				if (tracks.length === 1) {
					// Put whole album in playlist
					var selectedTrack = tracks[0];

					tracks = $$(selectedTrack.parentNode, ".track");
					index = tracks.indexOf(selectedTrack);
				}

				player.replace(tracks);
				player.play(index);

				return false;
			}
		},

		".controls .enqueue": {
			"click": function(e) {
				e.preventDefault();
				e.stopPropagation();

				player.enqueue(this.parentNode.parentNode, player.playing === -1 ? 0 : player.playing + 1);

				return false;
			}
		},

		".controls .add": {
			"click": function(e) {
				e.preventDefault();
				e.stopPropagation();

				player.enqueue(this.parentNode.parentNode);
				
				return false;
			}
		}
	};

	playlistsBehaviour = {
		"li.track": {
			/* Prevent text selection*/
			"mousedown": function(e) {
				e.preventDefault();
				return false;
			},

			"dblclick": function(e) {
				e.preventDefault();

				var tracks = $$(this.parentNode, ".track"),
					index = tracks.indexOf(this);

				player.replace(tracks);
				player.play(index);

				return false;
			}
		},
	};

	
	ist.pushScope({
		humanTime: function(duration) {
			var hours = Math.floor(duration / 3600),
				minutes = Math.floor(duration % 3600 / 60),
				seconds = Math.floor(duration) % 60;
			
			return hours == 0 ? minutes + ":" + (seconds > 9 ? seconds : "0" + seconds)
							  : hours + "h" + (minutes > 9 ? minutes : "0" + minutes) + "m" + (seconds > 9 ? seconds : "0" + seconds) + "s";
		},

		newArtist: (function() {
			var lastArtist;

			return function(artist) {
				var result = (artist !== lastArtist);

				lastArtist = artist;
				return result;
			};
		}())
	});
	
	music = {
		manifest: {
			"title": "music",
			"pages": {
				"albums": {},
				"playlists": { icon: "playlist" }
			}
		},
		
		init: function() {
			ui.loadCSS("player");
			ui.loadCSS("albumlist", "");

			router.on("albums", function(err, req, next) {
				var loadMore,
					albumPartial = albumlistTemplate.findPartial("album");

				if (err) {
					next(err);
					return;
				}

				albumlistContainer = ui.container("albums");
				albumlistContainer.scrolledToEnd.add(function() {
					if (loadMore) {
						albumlistContainer.$(".loading").style.display = "block";
						loadMore();
					}
				});

				while (albumlistContainer.firstChild) {
					albumlistContainer.removeChild(albumlistContainer.firstChild);
				}
				
				loadMore = resources.albums.list(function(err, albums) {

					var albumlist = albumlistContainer.$(".albumlist");

					if (!albumlist) {
						// Initial render
						albumlistContainer.appendChild(albumlistTemplate.render({
							albums: albums
						}));
					} else if (albums) {
						// Append new albums
						albums.forEach(function(album) {
							albumlist.appendChild(albumPartial.render(album));
						});
					} else {
						// Nothing more to load
						loadMore = null;
					}

					albumlistContainer.$(".loading").style.display = "none";
					albumlistContainer.behave(albumlistBehaviour);
				});
				
				albumlistContainer.show();
				next();
			});

			router.on("playlists", function(err, req, next) {
				var loadMore,
					playlistPartial = playlistsTemplate.findPartial("playlist");

				if (err) {
					next(err);
					return;
				}

				playlistsContainer = ui.container("playlists");
				playlistsContainer.scrolledToEnd.add(function() {
					if (loadMore) {
						playlistsContainer.$(".loading").style.display = "block";
						loadMore();
					}
				});

				while (playlistsContainer.firstChild) {
					playlistsContainer.removeChild(playlistsContainer.firstChild);
				}
				
				loadMore = resources.playlists.list(function(err, playlists) {

					var container = playlistsContainer.$(".playlists");

					if (!container) {
						// Initial render
						playlistsContainer.appendChild(playlistsTemplate.render({
							playlists: playlists
						}));
					} else if (playlists) {
						// Append new playlists
						playlists.forEach(function(playlist) {
							container.appendChild(playlistPartial.render(playlist));
						});
					} else {
						// Nothing more to load
						loadMore = null;
					}

					playlistsContainer.$(".loading").style.display = "none";
					playlistsContainer.behave(playlistsBehaviour);
				});
				
				playlistsContainer.show();
				next();
			});

			player.currentTrackChanged.add(function(trackId) {
				var track = albumlistContainer.$(".track[data-id='" + trackId + "']"),
					playing = albumlistContainer.$(".track.playing");

				if (playing) {
					playing.classList.remove("playing");
				}

				if (track) {
					track.classList.add("playing");
				}
			});

			player.trackLoadingFailed.add(function(trackId) {
				var track = albumlistContainer.$(".track[data-id='" + trackId + "']");

				track.classList.add("loaderror");
			});
		},
		
		renderApplet: function() {
			return appletTemplate.render({ player: player.render() });
		}
	};
	
	return music;
});