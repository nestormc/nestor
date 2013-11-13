/*jshint browser:true */
/*global define */

define(["when"], function(when) {
	"use strict";

	return {
		dropImage: function(dataTransfer) {
			var promises = [];

			function tryImage(src, deferred) {
				var img = new Image();
			
				deferred = deferred || when.defer();

				img.addEventListener("load", function() {
					deferred.resolve(src);
				});

				img.addEventListener("error", function() {
					deferred.reject();
				});

				if (promises.indexOf(deferred.promise) === -1) {
					promises.push(deferred.promise);
				}

				img.src = src;
			}

			function tryFile(file) {
				var reader = new FileReader(),
					deferred = when.defer();

				reader.addEventListener("load", function() {
					tryImage(this.result, deferred);
				});

				reader.addEventListener("error", function() {
					deferred.reject();
				});

				reader.readAsDataURL(file);
				return deferred.promise;
			}

			[].slice.call(dataTransfer.items).forEach(function(item) {
				var deferred;

				if (item.kind === "string") {
					if (item.type === "text/uri-list") {
						deferred = when.defer();
						item.getAsString(function(str) {
							tryImage(str, deferred);
						});
						promises.push(deferred.promise);
					} else if (item.type === "text/html") {
						deferred = when.defer();
						item.getAsString(function(html) {
							var match = html.match(/<img[^>]+src="([^"]+)"/);
							if (match) {
								tryImage(match[1], deferred);
							} else {
								deferred.reject();
							}
						});
						promises.push(deferred.promise);
					}
				} else if (item.kind === "file") {
					promises.push(tryFile(item.getAsFile()));
				}
			});

			return promises.length ? when.any(promises) : when.reject();
		}
	};
});