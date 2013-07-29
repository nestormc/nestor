/*jshint browser:true */
/*global require, define, $, $$ */

define(
[
	"when", "ist",
	"ist!tmpl/music/applet",
	"ist!tmpl/music/albumlist"
],
function(when, ist, appletTemplate, albumlistTemplate) {
	"use strict";

	var music;
	
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
			
			ui.loadCSS("albumlist", "albums");

			router.on("albums", function(err, req, next) {
				if (!err) {
					var container = ui.container("albums");

					while (container.firstChild) {
						container.removeChild(container.firstChild);
					}
					
					rest("albums").list({ limit: 0 })
					.then(function(albums) {
						container.appendChild(albumlistTemplate.render({ albums: albums._items }));
						container.show();
					}).otherwise(function(e) {
						err = e;
					});
				}
				
				next(err);
			});
		},
		
		renderApplet: function() {
			return appletTemplate.render();
		}
	};
	
	return music;
});