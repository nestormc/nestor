/*jshint browser:true */
/*global require, define, $, $$ */

define(['when', 'ist', 'ist!tmpl/music/tracklist'], function(when, ist, tracklistTemplate) {
	ist.pushScope({
		humanTime: function(duration) {
			var minutes = Math.floor(duration / 60),
				seconds = Math.floor(duration) % 60;
			
			return minutes + ':' + (seconds > 9 ? seconds : '0' + seconds);
		}
	});
	
	
	return {
		nestor: null,
	
		manifest: {
			"title": "music",
			"pages": {
				"tracks": {},
				"playlists": { icon: "playlist" }
			}
		},
		
		init: function(nestor) {
			this.nestor = nestor;
		},
		
		renderApplet: function() {
			return document.createTextNode("Music Applet");
		},
		
		render: function() {
			var recvtracks;
			
			this.nestor.rest("tracks").list({ limit: 0 })
			.then(function(tracks) {
				var tbody = $(".tracks"),
					partial = tracklistTemplate.findPartial("tracks");
				
				tbody.parentNode.replaceChild(partial.render({ tracks: tracks._items }), tbody);
			}).otherwise(function(err) {
				this.nestor.appError(err);
			});
			
			return tracklistTemplate.render({ tracks: [] });
		}
	};
});