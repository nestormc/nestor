/*jshint browser: true*/
/*global define, console*/

define(["when", "ui", "rest", "player/capabilities"], function(when, ui, rest, capabilities) {
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
	 * Media element event handlers
	 */

	var mediaEvents = {
		"ended": function trackEnded(track) {
			if (track._media) {
				track.ended.dispatch();
			}
		},

		"timeupdate": function trackTimeUpdate(track) {
			if (track._media) {
				track._currentTime = track._media.currentTime + (track._requestedSeek || 0);
				track.timeChanged.dispatch(track._currentTime);
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
		this._requestedSeek = this._currentTime = 0;
		this._playing = false;
		this._cast = null;

		this._info = rest.get("stream/%s/%s", provider, id)
			.then(function(info) {
				if (info.type === "video") {
					self._quality = info.height;

					self._display = document.createElement("div");
					self._display.className = "full-display";
					self._display.style.backgroundColor = "black";

					displayDeferred.resolve(self._display);
				} else {
					self._quality = info.bitrate;

					displayDeferred.resolve(getTrackDisplay(info.cover));
				}

				return info;
			});

		this.ended = ui.signal();
		this.timeChanged = ui.signal();
		this.lengthChanged = ui.signal();

		this.metadata = this._info.then(function(info) {
			return {
				title: info.title || "",
				subtitle: info.subtitle || "",
				length: info.length
			};
		});

		this.display = displayDeferred.promise;
	}


	StreamingTrack.prototype = {
		_isBuiltinStreamingTrack: true,

		_createMedia: function(info) {
			var self = this;
			var media = this._media = info.type === "audio" ? new Audio() : document.createElement("video");

			media.controls = false;
			media.preload = "none";
			media.autoplay = false;

			var loadDeferred = when.defer();
			media.loadPromise = loadDeferred.promise;

			media.addEventListener("canplay", function() {
				loadDeferred.resolve();
			});

			Object.keys(mediaEvents).forEach(function(event) {
				var handler = mediaEvents[event].bind(null, self);
				media.addEventListener(event, handler);
			});

			if (info.type === "video") {
				self._display.innerHTML = "";
				media.style.display = "block";
				media.style.width = media.style.height = "100%";
				self._display.appendChild(media);
			}

			this.display.then(function(display) {
				display.innerHTML = "";
				display.appendChild(media);
			});
		},

		_getStreamURL: function(client, seek) {
			return [
				window.location.protocol + "/",
				window.location.host,
				"stream",
				this._provider,
				encodeURIComponent(this._id),
				client,
				"auto",
				this._quality,
				seek
			].join("/");
		},

		_setSource: function() {
			var self = this;

			this.metadata.then(function() {
				if (self._requestedLoad) {
					if (self._cast) {
						self._cast.load(self._getStreamURL("cast", self._requestedSeek));
					} else {
						self._media.src = self._getStreamURL("web", self._requestedSeek);
						self._media.preload = "auto";
					}

					if (self._playing) {
						self.play();
					}
				}
			});
		},

		cast: function(controller) {
			var self = this;

			if (controller === "display") {
				if (this._cast) {
					// Switching back from cast
					this._cast.pause();
					this._cast.timeChanged.dispose();
					this._cast.loaded.dispose();

					this._requestedSeek = this._currentTime;
				}

				this._cast = null;
				this._info.then(function(info) {
					self._createMedia(info);
				});
			} else {
				if (this._media) {
					// Switching to cast
					this._media.pause();

					if (this._media.parentNode) {
						this._media.parentNode.removeChild(this._media);
					}

					this._requestedSeek = this._currentTime;
				}

				this._media = null;
				this._cast = controller;

				this._cast.timeChanged.add(function(time) {
					self._currentTime = time + (self._requestedSeek || 0);
					self.timeChanged.dispatch(self._currentTime);
				});

				var loadDeferred = when.defer();

				this._cast.loadPromise = loadDeferred.promise;
				this._cast.loaded.add(function() {
					loadDeferred.resolve();
				});
			}

			if (this._requestedLoad) {
				this._setSource();
			}
		},

		preload: function(canPreload) {
			if (canPreload) {
				this._requestedLoad = true;

				if (this._media) {
					this._setSource();
				}
			} else {
				this._requestedLoad = false;

				if (this._media) {
					this._media.src = "";
					this._media.preload = "none";
				}
			}
		},

		play: function() {
			var self = this;
			this._playing = true;

			if (this._cast) {
				this._cast.loadPromise.then(function() {
					self._cast.play();
				});
			} else if (this._media) {
				this._media.loadPromise.then(function() {
					self._media.play();
				});
			}
		},

		pause: function() {
			this._playing = false;

			if (this._cast) {
				this._cast.pause();
			} else if (this._media) {
				this._media.pause();
			}
		},

		seek: function(time) {
			this._requestedSeek = time;
			this._setSource();
		},

		dispose: function() {
			if (this._cast) {
				this._cast.pause();
				this._cast.timeChanged.dispose();
				this._cast.loaded.dispose();
				this._cast = null;
			} else if (this._media) {
				this._media.pause();

				if (this._media.parentNode) {
					this._media.parentNode.removeChild(this._media);
				}

				this._media = null;
			}

			this.ended.dispose();
			this.timeChanged.dispose();
			this.lengthChanged.dispose();
		}
	};


	return StreamingTrack;
});
