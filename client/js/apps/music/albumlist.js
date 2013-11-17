/*jshint browser:true */
/*global define */

define([
	"ui", "dom", "router", "when", "share",

	"resources", "util", "player",

	"ist!templates/albumlist"
], function(ui, dom, router, when, share, resources, util, player, template) {
	"use strict";

	var $ = dom.$,
		$$ = dom.$$,
		$P = dom.$P;


	function dataUpdater(data, tracks) {
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
					_id: artist.replace(/:/g, "::") + ":" + album.replace(/:/g, "::"),
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


	var behaviour = {
		".cover > img": {
			"error": function() {
				this.src = "images/nocover.svg";
			}
		},

		".cover": {
			"dragover": function(e) {
				var dropzone = $(this, ".dropzone");

				if (dropzone.promise) {
					return;
				}

				dropzone.classList.add("dragging");
				dropzone.promise = util.dropImage(e.dataTransfer);

				dropzone.promise
				.then(function(src) {
					dropzone.classList.add("valid");
					$(dropzone, ".valid").src = src;
				})
				.otherwise(function() {
					dropzone.classList.add("invalid");
				});

				e.preventDefault();
				return false;
			}
		},

		".cover .dropzone": {
			"dragleave": function(e) {
				delete this.promise;

				this.classList.remove("dragging");
				this.classList.remove("valid");
				this.classList.remove("invalid");

				e.stopPropagation();
			},

			"drop": function(e) {
				var album = $P(this, ".album"),
					dropzone = this;

				this.promise.then(function(src) {
					$(album, ".cover img").src = src;
					resources.covers.save(album.dataset.artist, album.dataset.title, src);
					delete dropzone.promise;
				})
				.otherwise(function() {
					delete dropzone.promise;
				});

				this.classList.remove("dragging");
				this.classList.remove("valid");
				this.classList.remove("invalid");

				e.preventDefault();
				return false;
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


	return {
		init: function(music) {
			music.setupListHandler(
				"albums",
				resources.tracks,
				dataUpdater,
				template,
				behaviour
			);

			router.on("!shareAlbum/:id/:artist/:title", function(err, req, next) {
				share("Album " + req.match.artist + " - " + req.match.title, "album:" + req.match.id);
				next();
			});

			/* Album edition */

			router.on("!editAlbum/:id", function(err, req, next) {
				var album = music.currentContainer.$(".album[data-id='" + req.match.id + "']");
				album.classList.add("editing");

				$$(album, ".editable").forEach(function(elem) {
					elem.previousContent = elem.textContent;
					elem.contentEditable = "true";
				});

				next();
			});

			router.on("!cancelAlbumEdit/:id", function(err, req, next) {
				var album = music.currentContainer.$(".album[data-id='" + req.match.id + "']");
				album.classList.remove("editing");

				$$(album, ".editable").forEach(function(elem) {
					elem.textContent = elem.previousContent;
					elem.contentEditable = "inherit";
				});

				next();
			});

			router.on("!commitAlbumEdit/:id", function(err, req, next) {
				var album = music.currentContainer.$(".album[data-id='" + req.match.id + "']");
				album.classList.remove("editing");

				var trackUpdates = {},
					trackIds = $$(album, ".track").map(function(elem) { return elem.dataset.id; });

				/* Gather edited data in trackUpdates */
				$$(album, ".editable").forEach(function(elem) {
					elem.contentEditable = "inherit";

					if (elem.textContent !== elem.previousContent) {
						var targets, field;

						if (elem.classList.contains("name")) {
							targets = trackIds;
							field = "artist";
						}

						if (elem.classList.contains("year")) {
							targets = trackIds;
							field = "year";
						}

						if (elem.classList.contains("title")) {
							if (elem.parentNode.classList.contains("track")) {
								targets = [elem.parentNode.dataset.id];
								field = "title";
							} else {
								targets = trackIds;
								field = "album";
							}
						}

						if (elem.classList.contains("number")) {
							targets = [elem.parentNode.dataset.id];
							field = "number";
						}

						targets.forEach(function(trackId) {
							if (!(trackId in trackUpdates)) {
								trackUpdates[trackId] = {};
							}

							trackUpdates[trackId][field] = elem.textContent;
						});
					}
				});

				when.map(Object.keys(trackUpdates), function(trackId) {
					return resources.tracks.update(trackId, trackUpdates[trackId]);
				}).otherwise(function(err) {
					ui.error("Update error", err.stack);
				}).ensure(function() {
					// TODO update album
					console.log("Update finished");
				});

				next();
			});
		}
	};
});