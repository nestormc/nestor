/*jshint node:true*/
/*global define*/
define(["signals"], function(signals) {
	"use strict";

	var changeEvents = ["fullscreenchange", "mozfullscreenchange", "webkitfullscreenchange"];
	var errorEvents = ["fullscreenerror", "mozfullscreenerror", "webkitfullscreenerror"];
	var requestMethods = ["requestFullscreen", "requestFullScreen", "mozRequestFullscreen", "mozRequestFullScreen", "webkitRequestFullscreen", "webkitRequestFullScreen"];
	var cancelMethods = ["cancelFullscreen", "cancelFullScreen", "mozCancelFullscreen", "mozCancelFullScreen", "webkitCancelFullscreen", "webkitCancelFullScreen"];
	var elementProperties = ["fullscreenElement", "mozFullscreenElement", "webkitFullscreenElement"];

	var requestMethod;
	requestMethods.forEach(function(method) {
		if (method in document.body) {
			requestMethod = method;
		}
	});

	var cancelMethod;
	cancelMethods.forEach(function(method) {
		if (method in document) {
			cancelMethod = method;
		}
	});

	var elementProperty;
	elementProperties.forEach(function(prop) {
		if (prop in document) {
			elementProperty = prop;
		}
	});

	changeEvents.forEach(function(event) {
		document.addEventListener(event, function changed() {
			if (document[elementProperty]) {
				fullscreen.entered.dispatch();
			} else {
				fullscreen.exited.dispatch();
			}
		});
	});

	errorEvents.forEach(function(event) {
		document.addEventListener(event, function errored() {
			fullscreen.failed.dispatch();
		});
	});

	var fullscreen = {
		enter: function(element) {
			if (requestMethod) {
				element[requestMethod]();
			} else {
				fullscreen.failed.dispatch();
			}
		},

		exit: function() {
			if (cancelMethod) {
				document[cancelMethod]();
			} else {
				fullscreen.failed.dispatch();
			}
		},

		entered: new signals.Signal(),
		exited: new signals.Signal(),
		failed: new signals.Signal()
	};

	return fullscreen;
});