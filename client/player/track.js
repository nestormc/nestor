/*jshint browser: true*/
/*global define, console*/

define(["when", "ui", "rest"], function(when, ui, rest) {
	"use strict";

	/*!
	 * Audio cover display helper
	 */


	var lastCover;
	var coverContainer;
	function getTrackDisplay(cover) {
		if (cover === lastCover) {
			return coverContainer;
		}

		if (!coverContainer) {
			coverContainer = document.createElement("div");
			coverContainer.style.backgroundSize = "contain";
			coverContainer.style.backgroundRepeat = "no-repeat";
			coverContainer.style.backgroundPosition = "center center";
			coverContainer.style.transition = "background .2s ease-in-out";
		}

		function setImage(src) {
			coverContainer.style.backgroundImage = "url(" + src + ")";
		}

		var img = new Image();

		img.addEventListener("error", function() {
			setImage("images/nocover.svg");
		});

		img.addEventListener("load", function() {
			setImage(img.src);
		});

		lastCover = img.src = cover;
		return coverContainer;
	}



	/*!
	 * Media format selection helper
	 */


	function preferredFormat(media, formats) {
		var maybes = [];
		var probably = null;

		Object.keys(formats).forEach(function(name) {
			if (probably) {
				return;
			}

			var format = formats[name];
			var mime = format.mimetype + "; codecs=\"" + format.codecs + "\"";

			switch (media.canPlayType(mime)) {
				case "probably":
					probably = name;
					break;

				case "maybe":
					maybes.push(name);
					break;
			}
		});

		if (probably) {
			return probably;
		} else {
			return maybes[0];
		}
	}



	/*!
	 * Media element event handlers
	 */

	var mediaEvents = {
		"canplay": function trackPlayable(track) {
			track.playable.dispatch();
		},

		"ended": function trackEnded(track) {
			track.ended.dispatch();
		},

		"timeupdate": function trackTimeUpdate(track) {
			track.timeChanged.dispatch(track._media.currentTime + (track._requestedSeek || 0));
		},

		"durationchange": function trackDurationChange(track) {
			var media = track._media;

			if (media.duration !== Infinity) {
				track.lengthChanged.dispatch(media.duration + (track._requestedSeek || 0));
			}
		},

		"progress": function trackLoadProgress(track) {
			var media = track._media;

			if (media.buffered.length) {
				if (Math.abs(media.buffered.end(media.buffered.length - 1) - media.duration) < 0.1) {
					track.loaded.dispatch();
				}
			}
		}
	};



	/*!
	 * Track implementation
	 */


	function StreamingTrack(provider, id) {
		var self = this;
		var displayDeferred = when.defer();

		this._provider = provider;
		this._id = id;
		this._quality = 0;
		this._requestedLoad = false;
		this._requestedSeek = 0;
		this._playing = false;

		this._mediaPromise = rest.get("stream/%s/%s", provider, id)
			.then(function(info) {
				self._createMedia(info);
				self._format = preferredFormat(self._media, info.formats);

				if (info.type === "video") {
					self._quality = 288;

					var display = document.createElement("div");
					display.className = "full-display";
					display.style.backgroundColor = "black";

					var video = self._media;
					video.style.display = "block";
					video.style.width = video.style.height = "100%";
					display.appendChild(video);

					displayDeferred.resolve(display);
				} else {
					self._quality = 128;

					displayDeferred.resolve(getTrackDisplay(info.cover));
				}

				return info;
			});


		this.playable = ui.signal();
		this.loaded = ui.signal();
		this.ended = ui.signal();
		this.timeChanged = ui.signal();
		this.lengthChanged = ui.signal();

		this.metadata = this._mediaPromise.then(function(info) {
			return {
				title: "TODO",
				subtitle: "TODO",
				length: info.length
			};
		});

		this.display = displayDeferred.promise;
	}


	StreamingTrack.prototype = {
		_createMedia: function(info) {
			var self = this;
			var media = this._media = info.type === "audio" ? new Audio() : document.createElement("video");

			media.controls = false;
			media.preload = "none";
			media.autoplay = false;

			var handlers = this._handlers = {};

			Object.keys(mediaEvents).forEach(function(event) {
				var handler = mediaEvents[event].bind(null, self);
				handlers[event] = handler;
				media.addEventListener(event, handler);
			});
		},

		_setSource: function() {
			var self = this;

			this.metadata.then(function() {
				if (self._requestedLoad) {
					self._media.src = "/stream/" + self._id + "/" + self._format + ":" + self._quality + "/" + self._requestedSeek;
					self._media.preload = "auto";

					if (self._playing) {
						self.play();
					}
				}
			});
		},

		load: function() {
			this._requestedLoad = true;
			this._setSource();
		},

		stopLoading: function() {
			this._requestedLoad = false;

			this._media.src = "";
			this._media.preload = "none";
		},

		play: function() {
			this._playing = true;
			this._media.play();
		},

		pause: function() {
			this._playing = false;
			this._media.pause();
		},

		seek: function(time) {
			this._requestedSeek = time;
			this._setSource();
		},

		dispose: function() {
			var self = this;

			this._mediaPromise.then(function() {
				var handlers = self._handlers;
				var media = self._media;

				Object.keys(handlers).forEach(function(event) {
					media.removeEventListener(event, handlers[event]);
				});

				self._handlers = null;

				media.pause();
				media.preload = "none";
				media.src = "";
			});

			this.playable.dispose();
			this.loaded.dispose();
			this.ended.dispose();
			this.timeChanged.dispose();
			this.lengthChanged.dispose();
		}
	};


	return StreamingTrack;
});
