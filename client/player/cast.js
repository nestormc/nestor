/*jshint browser:true*/
/*global define, console*/

define(["chromecast", "signals", "when"], function(chromecast, signals, when) {
	"use strict";



	/*!
	 * Initialization helpers
	 */


	function checkAvailability() {
		if (chromecast.isAvailable) {
			initialize();
		} else {
			setTimeout(checkAvailability, 1000);
		}
	}


	function initialize() {
		var appID = "E2538DF7";
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
			if (!isAlive) {
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


	function CastController(media) {
		if (media) {
			this._bindMedia(media);
			this._loadPromise = when.resolve(media);
		} else {
			this._media = this._loadPromise = null;
		}
	}

	CastController.prototype = {
		timeChanged: new signals.Signal(),
		loaded: new signals.Signal(),

		_bindMedia: function(media) {
			var self = this;

			this._media = media;
			media.addUpdateListener(function mediaUpdated() {
				self.timeChanged.dispatch(media.currentTime);
			});
		},

		load: function(url) {
			var self = this;
			var deferred = when.defer();

			if (cast._session) {
				var info = new chromecast.media.MediaInfo(url);
				var request = new chromecast.media.LoadRequest(info);

				cast._session.loadMedia(
					request,
					function mediaDiscovered(media) {
						console.log("CAST: media discovered");
						console.dir(media);

						self._media = media;
						self._bindMedia(media);
						self.loaded.dispatch();
						deferred.resolve(media);
					},
					function mediaError(e) {
						console.log("CAST: media error");
						console.dir(e);

						deferred.reject(e);
					}
				);
			} else {
				deferred.reject("no cast session");
			}

			this._loadPromise = deferred.promise;
			return deferred.promise;
		},

		play: function() {
			this._loadPromise.then(function(media) {
				media.play(null, function() {}, function() {});
			});
		},

		pause: function() {
			this._loadPromise.then(function(media) {
				media.pause(null, function() {}, function() {});
			});
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
						cast._session = null;
						cast.sessionStopped.dispatch();
					},
					function stopError(e) {
						console.log("CAST: stop error");
						console.dir(e);
					}
				);
			}
		},

		CastController: CastController
	};

	return cast;
});
