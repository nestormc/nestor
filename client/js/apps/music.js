/*jshint browser:true */
/*global require, define, $, $$ */

define(
[
	"when", "ist",
	"./music/player",
	"ist!tmpl/music/applet",
	"ist!tmpl/music/albumlist"
],
function(when, ist, player, appletTemplate, albumlistTemplate) {
	"use strict";

	var music,
		container,
		trackListBehaviour;

	trackListBehaviour = {
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
					console.log("click");
					e.preventDefault();

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
				e.preventDefault();

				player.replace(container.$$(".selected"));
				player.play();

				return false;
			}
		}
	};
	
	ist.pushScope({
		humanTime: function(duration) {
			var hours = Math.floor(duration / 3600),
				minutes = Math.floor(duration % 3600 / 60),
				seconds = Math.floor(duration) % 60;
			
			return hours == 0 ? minutes + ":" + (seconds > 9 ? seconds : "0" + seconds)
							  : hours + "h" + (minutes > 9 ? minutes : "0" + minutes) + "m" + (seconds > 9 ? seconds : "0" + seconds) + "s";
		}
	});
	
	music = {
		manifest: {
			"title": "music",
			"pages": {
				"albums": {},
				"playlists": { icon: "playlist" }
			}
		},
		
		init: function(nestor) {
			var router = nestor.router,
				ui = nestor.ui,
				rest = nestor.rest;

			this.ui = ui;
			
			ui.loadCSS("albumlist", "albums");

			router.on("albums", function(err, req, next) {
				if (err) {
					next(err);
					return;
				}

				container = ui.container("albums");

				while (container.firstChild) {
					container.removeChild(container.firstChild);
				}
				
				rest("albums").list({ limit: 0 })
				.then(function(albums) {
					container.appendChild(albumlistTemplate.render({
						albums: albums._items
					}));

					container.behave(trackListBehaviour);

					container.show();
					next();
				}).otherwise(function(e) {
					next(e);
				});
			});
		},
		
		renderApplet: function() {
			return appletTemplate.render({ player: player.render(this.ui) });
		}
	};
	
	return music;
});