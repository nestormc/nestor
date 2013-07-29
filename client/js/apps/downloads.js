/*jshint browser:true */
/*global require, define, $, $$ */

define(['when'], function(when) {
	"use strict";
	
	return {
		manifest: {
			"title": "downloads",
			"pages": {
				"downloads": { icon: "downloads" },
				"search": { icon: "search" }
			}
		},
		
		init: function(nestor) {
			return when.resolve();
		},
		
		renderApplet: function() {
			return document.createTextNode("Downloads Applet");
		}
	};
});