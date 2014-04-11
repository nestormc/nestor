/*jshint browser:true*/
/*global define, console*/

define(["chromecast", "signals", "rest", "when"], function(chromecast, signals, rest, when) {
	"use strict";


	// App ID to use, "E2538DF7" is the nestor-styled receiver
	var appID = "E2538DF7";

	// Media time update interval in milliseconds
	var updateInterval = 1000;


	var externalIP;
	function getExternalIP() {
		if (externalIP) {
			return when.resolve(externalIP);
		} else {
			return rest.get("external-ip").then(function(ret) {
				externalIP = ret.address;
				return externalIP;
			});
		}
	}


	/*!
	 * Initialization helpers
	 */


	function checkAvailability() {
		if (typeof chromecast === "undefined") {
			console.log("ChromeCast is not available. At all.");
			return;
		}

		if (chromecast.isAvailable) {
			initialize();
		} else {
			setTimeout(checkAvailability, 1000);
		}
	}


	function initialize() {
		// Nestor-styled receiver id
		var sessionRequest = new chromecast.SessionRequest(appID);

		var apiConfig = new chromecast.ApiConfig(
			sessionRequest,
			sessionListener,
			function receiverListener(availability) {
				if (availability === chromecast.ReceiverAvailability.AVAILABLE) {
					console.log("CAST: available");
					cast.availabilityChanged.dispatch(true);
				} else {
					cast.availabilityChanged.dispatch(false);
				}
			}
		);

		chromecast.initialize(
			apiConfig,
			function initSuccess() {
				cast._initialized = true;
			},
			function initError(e) {
				console.log("CAST: init ko");
				console.dir(e);
			}
		);
	}


	function sessionListener(session) {
		console.log("CAST: session listener");
		console.dir(session);

		session.addUpdateListener(function sessionUpdateListener(isAlive) {
			if (!isAlive && cast._session) {
				cast._session = null;
				cast.sessionStopped.dispatch();
			}
		});

		cast._session = session;
		cast.sessionStarted.dispatch(session);
	}



	/*!
	 * Cast media controller
	 */


	function CastMedia(media) {
		this.stateChanged = new signals.Signal();
		this.timeChanged = new signals.Signal();

		this._media = null;
		this._state = "loading";
		this._interval = null;

		this._requestedPause = false;
		this._requestedPlay = false;
		this._requestedVolume = -1;

		if (media) {
			this.setMedia(media);
		}
	}


	var castMediaToken = {};
	CastMedia.prototype = {
		_setMedia: function(media) {
			var self = this;

			media.addUpdateListener(function(isAlive) {
				// Does not seem to be called
				// self.timeChanged.dispatch(media.currentTime);

				if (!isAlive) {
					self.dispose(castMediaToken);
				}
			});

			this._interval = setInterval(function() {
				if (self._state !== "killed") {
					self.timeChanged.dispatch(media.getEstimatedTime());
				}
			}, updateInterval);

			this._media = media;

			if (this._requestedPlay) {
				this.play();
			}

			if (this._requestedPause) {
				this.pause();
			}

			if (this._requestedVolume !== -1) {
				this.volume(this._requestedVolume);
			}
		},

		_setState: function(state) {
			if (this._state !== "killed") {
				this.stateChanged.dispatch(state);
			}

			this._state = state;
		},

		pause: function() {
			if (this._media) {
				this._media.pause(null, function() {}, function() {});
			} else {
				this._requestedPause = true;
				this._requestedPlay = false;
			}
		},

		play: function() {
			if (this._media) {
				this._media.play(null, function() {}, function() {});
			} else {
				this._requestedPause = false;
				this._requestedPlay = true;
			}
		},

		volume: function(vol) {
			if (this._media) {
				var volume = new chromecast.Volume(vol, false);
				var request = new chromecast.media.VolumeRequest(volume);

				this._media.setVolume(request, function() {}, function() {});
			} else {
				this._requestedVolume = vol;
			}
		},

		dispose: function(token) {
			clearInterval(this._interval);
			this._setState("killed");
			this.stateChanged.dispose();
			this.timeChanged.dispose();

			if (token !== castMediaToken) {
				this.pause();
			}

			this._media = null;
			this._interval = null;
		}
	};


	/*!
	 * Public interface
	 */


	var cast = {
		availabilityChanged: new signals.Signal(),
		sessionStarted: new signals.Signal(),
		sessionStopped: new signals.Signal(),

		_initialized: false,
		_session: null,

		init: function() {
			checkAvailability();
		},

		startSession: function() {
			chromecast.requestSession(
				sessionListener,
				function sessionError(e) {
					console.log("CAST: session error");
					console.dir(e);
				}
			);
		},

		stopSession: function() {
			if (cast._session) {
				cast._session.stop(
					function stopSuccess() {
						if (cast._session) {
							cast._session = null;
							cast.sessionStopped.dispatch();
						}
					},
					function stopError(e) {
						console.log("CAST: stop error");
						console.dir(e);
					}
				);
			}
		},

		load: function(path, mimetype) {
			if (!cast._session) {
				throw new Error("No active cast session");
			}

			var castmedia = new CastMedia();

			getExternalIP().then(function(ip) {
				var url = [
						location.protocol + "/",
						ip,
						location.port,
						path
					].join("/");

				var info = new chromecast.media.MediaInfo(url, mimetype);
				var request = new chromecast.media.LoadRequest(info);

				cast._session.loadMedia(
					request,
					function mediaDiscovered(media) {
						console.log("CAST: media discovered");
						console.dir(media);

						castmedia._setMedia(media);
					},
					function mediaError(e) {
						console.log("CAST: media error");
						console.dir(e);

						castmedia._setState("error");
					}
				);
			});

			return castmedia;
		}
	};

	return cast;
});
