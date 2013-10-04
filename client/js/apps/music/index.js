/*jshint browser:true */
/*global define, console */

define(
[
	"ist", "ui", "router", "dom", "when",

	"player",
	"resources",

	"ist!templates/applet",
	"ist!templates/albumlist",
	"ist!templates/playlists"
],
function(
	ist, ui, router, dom, when,

	player,
	resources,

	appletTemplate,
	albumlistTemplate,
	playlistsTemplate
) {
	"use strict";

	var music,
		currentContainer, currentTrackId, currentPlaylist,
		$ = dom.$,
		$P = dom.$P,
		$$ = dom.$$;


	/*!
	 * Album list definitions 
	 */

	function albumlistDataUpdater(data, tracks) {
		if (!data) {
			data = { artnames: [], artists: [] };
		}

		var artists = data.artists,
			artnames = data.artnames;

		tracks.forEach(function(track) {
			var artist = track.artist,
				artidx = artnames.indexOf(artist),
				art, albums, albnames;

			if (artidx === -1) {
				albums = [];
				albnames = [];

				artnames.push(artist);
				artists.push({
					name: artist,
					albnames: albnames,
					albums: albums
				});
			} else {
				art = artists[artidx];
				albnames = art.albnames;
				albums = art.albums;
			}

			var album = track.album,
				albidx = albnames.indexOf(album);

			if (albidx === -1) {
				albnames.push(album);
				albums.push({
					_id: artist + ":" + album,
					artist: artist,
					title: album,
					year: track.year,
					hasCover: false,
					trackIds: [track._id],
					tracks: [track]
				});
			} else {
				albums[albidx].trackIds.push(track._id);
				albums[albidx].tracks.push(track);
			}
		});

		return data;
	}

	var albumlistBehaviour = {
		".cover": {
			"error": function() {
				this.src = "images/nocover.svg";
			}
		},

		".list": {
			/* Unselect tracks */
			"click": function(e) {
				var container = $P(this, ".container");

				e.preventDefault();

				container.$$(".selected").forEach(function(sel) {
					sel.classList.remove("selected");
				});

				return false;
			}
		},

		"li.track": {
			/* Prevent text selection when shift-clicking tracks */
			"mousedown": function(e) {
				if (e.shiftKey || e.ctrlKey || e.target.contentEditable !== "true") {
					e.preventDefault();
				}
				return false;
			},

			/* Handle track selection with click, ctrl+click, shift+click */
			"click": (function() {
				var firstClicked;

				return function(e) {
					var container = $P(this, ".container");

					e.preventDefault();
					e.stopPropagation();

					if (!e.ctrlKey) {
						container.$$(".selected").forEach(function(sel) {
							sel.classList.remove("selected");
						});
					}

					if (e.shiftKey && firstClicked) {
						var tracks = container.$$("li.track"),
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
				var container = $P(this, ".container");

				e.preventDefault();

				var tracks = container.$$(".selected"),
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
		}
	};


	/*!
	 * Playlists definitions 
	 */

	function playlistsDataUpdater(data, playlists) {
		if (!data) {
			data = { playlists: [] };
		}

		data.playlists = data.playlists.concat(playlists);
		return data;
	}

	var playlistsBehaviour = {
		"li.track": {
			/* Prevent text selection*/
			"mousedown": function(e) {
				e.preventDefault();
				return false;
			},

			"dblclick": function(e) {
				e.preventDefault();

				var playlist = $P(this, ".playlist"),
					tracks = $$(this.parentNode, ".track"),
					index = tracks.indexOf(this);

				player.replace(tracks, playlist.dataset.name);
				player.play(index);

				return false;
			}
		},
	};


	// TODO un-global this
	window.humanTime = function(duration) {
		var hours = Math.floor(duration / 3600),
			minutes = Math.floor(duration % 3600 / 60),
			seconds = Math.floor(duration) % 60;
		
		return hours === 0 ? minutes + ":" + (seconds > 9 ? seconds : "0" + seconds)
						   : hours + "h" + (minutes > 9 ? minutes : "0" + minutes) + "m" + (seconds > 9 ? seconds : "0" + seconds) + "s";
	};

	music = {
		manifest: {
			"title": "music",
			"pages": {
				"albums": {},
				"playlists": { icon: "playlist" }
			}
		},

		setupListHandler: function(route, resource, updater, template, behaviour) {
			var loaded = false,
				stoppingSet = false,
				promise, data, rendered;

			router.on(route, function(err, req, next) {
				if (err) {
					next(err);
					return;
				}

				var container = ui.container(route);

				if (!promise) {
					loaded = false;
					stoppingSet = false;
					promise = resource.list();
				}

				data = updater(data, []);

				// Render template
				try {
					rendered = template.render(data);
				} catch(e) {
					console.log("RENDER: " + e.stack);
				}
				container.appendChild(rendered);

				// Add scroll handler to load more
				container.scrolledToEnd.add(function() {
					if (!loaded) {
						container.$(".loading").style.display = "block";
						promise.fetchMore();
					}
				});

				promise
				.whenData(function(items) {
					// Call data updater
					data = updater(data, items);

					// Update template
					try {
						rendered.update(data);
					} catch(e) {
						console.log("UPDATE: " + e.stack);
					}

					music.refreshCurrentTrack();
					music.refreshCurrentPlaylist();

					container.$(".loading").style.display = "none";
					container.behave(behaviour);
				})
				.then(function() {
					// Nothing more to load
					loaded = true;
				})
				.otherwise(function(err) {
					console.log(err);
				});

				if (!stoppingSet) {
					stoppingSet = true;
					ui.stopping.add(function() {
						// Cancel loading when UI stops
						promise.cancel();
					});
				}

				currentContainer = container;
				container.show();
				next();
			});
		},

		refreshCurrentTrack: function() {
			if (currentContainer) {
				var track = currentContainer.$(".track[data-id='" + currentTrackId + "']"),
					playing = currentContainer.$(".track.playing");

				if (playing) {
					playing.classList.remove("playing");
				}

				if (track) {
					track.classList.add("playing");
				}
			}
		},

		refreshCurrentPlaylist: function() {
			if (currentContainer) {
				var playlist = currentContainer.$(".playlist[data-name='" + currentPlaylist + "']"),
					playing = currentContainer.$(".playlist.playing"),
					floating = currentContainer.$(".playlist[data-name='!floating']");

				if (floating) {
					floating.style.display = currentPlaylist === "!floating" ? "block" : "none";
				}

				if (playing) {
					playing.classList.remove("playing");
				}

				if (playlist) {
					playlist.classList.add("playing");
				}
			}
		},
		
		init: function() {
			ui.loadCSS("player");
			ui.loadCSS("albumlist", "");

			music.setupListHandler(
				"albums",
				resources.tracks,
				albumlistDataUpdater,
				albumlistTemplate,
				albumlistBehaviour
			);

			music.setupListHandler(
				"playlists",
				resources.playlist,
				playlistsDataUpdater,
				playlistsTemplate,
				playlistsBehaviour
			);

			/* Enqueue track actions */
		
			router.on("!enqueue/:id", function(err, req, next) {
				var track = currentContainer.$(".track[data-id='" + req.match.id + "']");
				player.enqueue(track, player.playing === -1 ? 0 : player.playing + 1);

				next();
			});

			router.on("!add/:id", function(err, req, next) {
				var track = currentContainer.$(".track[data-id='" + req.match.id + "']");
				player.enqueue(track);

				next();
			});

			/* Album edition */

			router.on("!editAlbum/:id", function(err, req, next) {
				var album = currentContainer.$(".album[data-id='" + req.match.id + "']");
				album.classList.add("editing");

				$$(album, ".editable").forEach(function(elem) {
					elem.previousContent = elem.textContent;
					elem.contentEditable = "true";
				});

				next();
			});

			router.on("!cancelAlbumEdit/:id", function(err, req, next) {
				var album = currentContainer.$(".album[data-id='" + req.match.id + "']");
				album.classList.remove("editing");

				$$(album, ".editable").forEach(function(elem) {
					elem.textContent = elem.previousContent;
					elem.contentEditable = "inherit";
				});

				next();
			});

			router.on("!commitAlbumEdit/:id", function(err, req, next) {
				var album = currentContainer.$(".album[data-id='" + req.match.id + "']");
				album.classList.remove("editing");

				var albumUpdate,
					trackUpdates = {};

				$$(album, ".editable").forEach(function(elem) {
					if (elem.textContent !== elem.previousContent) {
						var target, field;

						if (elem.classList.contains("name")) {
							target = "album";
							field = "artist";
						}

						if (elem.classList.contains("year")) {
							target = "album";
							field = "year";
						}

						if (elem.classList.contains("title")) {
							if (elem.parentNode.classList.contains("track")) {
								target = elem.parentNode.dataset.id;
								field = "title";
							} else {
								target = "album";
								field = "title";
							}
						}

						if (elem.classList.contains("number")) {
							target = elem.parentNode.dataset.id;
							field = "number";
						}

						if (target === "album") {
							albumUpdate = albumUpdate || {};
							albumUpdate[field] = elem.textContent;
						} else {
							if (!(target in trackUpdates)) {
								trackUpdates[target] = {};
							}

							trackUpdates[target][field] = elem.textContent;
						}
					}

					elem.contentEditable = "inherit";
				});


				var albumId = album.dataset.id;

				(albumUpdate ?
					resources.albums.update(albumId, albumUpdate) :
					when.resolve())
				.then(function() {
					return when.map(Object.keys(trackUpdates), function(trackId) {
						return resources.albums.updateTrack(albumId, trackId, trackUpdates[trackId]);
					});
				}).otherwise(function(err) {
					ui.error("Update error", err.stack);
				}).ensure(function() {
					// TODO update album
					console.log("Update finished");
				});

				next();
			});

			/* Player state changes */

			player.currentTrackChanged.add(function(trackId) {
				currentTrackId = trackId;
				music.refreshCurrentTrack();
			});

			player.currentPlaylistChanged.add(function(playlist) {
				currentPlaylist = playlist;
				music.refreshCurrentPlaylist();
			});
		},
		
		renderApplet: function() {
			return appletTemplate.render({ player: player.render() });
		}
	};
	
	return music;
});