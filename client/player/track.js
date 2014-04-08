/*jshint browser: true*/
/*global define, console*/

define(["when", "ui", "rest", "player/capabilities"], function(when, ui, rest, capabilities) {
	"use strict";


	/*!
	 * Available qualities
	 */


	var availableQualities = {
		video: [1080, 720, 576, 480, 360, 240, 144],
		audio: [320, 240, 196, 160, 128, 96, 64]
	};



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
		this._quality = "original";
		this._requestedLoad = false;
		this._requestedSeek = this._currentTime = 0;
		this._playing = false;

		this._media = null;
		this._cast = null;
		this._castMedia = null;

		this._info = rest.get("stream/%s/%s", provider, id)
			.then(function(info) {
				if (info.type === "video") {
					self._display = document.createElement("div");
					self._display.className = "full-display";
					self._display.style.backgroundColor = "black";

					displayDeferred.resolve(self._display);
				} else {
					displayDeferred.resolve(getTrackDisplay(info.cover));
				}

				return info;
			});

		this.ended = ui.signal();
		this.timeChanged = ui.signal();
		this.lengthChanged = ui.signal();

		this.metadata = this._info.then(function(info) {
			var qualities = {};
			var unit = info.type === "video" ? "p" : " kbps";
			var max = info.type === "video" ? info.height : info.bitrate;

			qualities.original = "Original (" + max + unit + ")";
			availableQualities[info.type].forEach(function(q) {
				if (q < max * 0.9) {
					qualities[q] = q + unit;
				}
			});

			return {
				title: info.title || "",
				subtitle: info.subtitle || "",
				length: info.length,
				qualities: qualities
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

			var playRequested = false;
			var pauseRequested = false;
			var disposed = false;

			media._origPause = media.pause;
			media._origPlay = media.play;

			media.addEventListener("canplay", function() {
				if (disposed) {
					return;
				}

				media.pause = media._origPause;
				media.play = media._origPlay;

				if (playRequested) {
					media.play();
				} else if (pauseRequested) {
					media.pause();
				}
			});

			media.play = function() {
				playRequested = true;
				pauseRequested = false;
			};

			media.pause = function() {
				playRequested = false;
				pauseRequested = true;
			};

			media.dispose = function() {
				disposed = true;
				media.pause();

				if (media.parentNode) {
					media.parentNode.removeChild(media);
				}
			};

			Object.keys(mediaEvents).forEach(function(event) {
				var handler = mediaEvents[event].bind(null, self);
				media.addEventListener(event, handler);
			});

			if (info.type === "video") {
				media.style.display = "block";
				media.style.width = media.style.height = "100%";

				this.display.then(function(display) {
					if (disposed) {
						return;
					}

					display.innerHTML = "";
					display.appendChild(media);
				});
			}
		},

		_getStreamURL: function(client, seek) {
			if (client === "cast") {
				return [
					"stream",
					this._provider,
					encodeURIComponent(this._id)
				].join("/") + "?" + [
					"client=cast",
					"quality=" + this._quality,
					"seek=" + seek
				].join("&");
			} else {
				return [
					window.location.protocol + "/",
					window.location.host,
					"stream",
					this._provider,
					encodeURIComponent(this._id)
				].join("/") + "?" + [
					"quality=" + this._quality,
					"seek=" + seek
				].join("&");
			}
		},

		_setSource: function() {
			var self = this;

			this.metadata.then(function() {
				if (self._requestedLoad) {
					if (self._cast) {
						if (self._castMedia) {
							self._castMedia.dispose();
						}

						self._castMedia = self._cast.load(self._getStreamURL("cast", self._requestedSeek), "video/webm");

						self._castMedia.timeChanged.add(function(time) {
							self._currentTime = time + (self._requestedSeek || 0);
							self.timeChanged.dispatch(self._currentTime);
						});
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
				if (this._castMedia) {
					// Switching back from cast
					this._castMedia.dispose();
					this._requestedSeek = this._currentTime;
				}

				this._cast = null;
				this._castMedia = null;

				this._info.then(function(info) {
					self._createMedia(info);
				});
			} else {
				if (this._media) {
					// Switching to cast
					this._media.dispose();
					this._requestedSeek = this._currentTime;
				}

				this._media = null;
				this._cast = controller;
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
			this._playing = true;

			if (this._castMedia) {
				this._castMedia.play();
			} else if (this._media) {
				this._media.play();
			}
		},

		pause: function() {
			this._playing = false;

			if (this._castMedia) {
				this._castMedia.pause();
			} else if (this._media) {
				this._media.pause();
			}
		},

		seek: function(time) {
			this._requestedSeek = Math.floor(time * 1000) / 1000;
			this._setSource();
		},

		setQuality: function(quality) {
			this._quality = quality;
			this._requestedSeek = this._currentTime;
			this._setSource();
		},

		dispose: function() {
			if (this._castMedia) {
				this._castMedia.dispose();
				this._cast = null;
				this._castMedia = null;
			} else if (this._media) {
				this._media.dispose();
				this._media = null;
			}

			this.ended.dispose();
			this.timeChanged.dispose();
			this.lengthChanged.dispose();
		}
	};


	return StreamingTrack;
});
