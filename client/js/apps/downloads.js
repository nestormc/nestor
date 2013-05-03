/*jshint browser:true */
/*global require, define, $, $$ */

define(['when'], function(when) {
	return {
		manifest: {
			"title": "downloads",
			"pages": {
				"downloads": {},
				"search": {}
			}
		},
		
		init: function(nestor) {
			return when.resolve();
		},
		
		renderApplet: function() {
			return document.createTextNode("Downloads Applet");
		},
		
		render: function() {
			return document.createTextNode("Downloads");
		}
	};
});