/*jshint node:true */
"use strict";

var when = require("when"),

	providers = {
		"bittorrent": require("./bittorrent"),
		"http": require("./http")
	};


var mapDownloadProperties = [
		"name", "state", "size", "error",
		"downloaded", "downloadRate", "seeders",
		"uploaded", "uploadRate", "leechers",
		"files"
	];


function mapDownload(providerName, download) {
	var data = { _id: providerName + ":" + download.id, type: providerName };

	mapDownloadProperties.forEach(function(key) {
		data[key] = download[key];
	});

	return data;
}


function getDownloadResource(rest, providerName, download) {
	return {
		"get": function(req, cb) {
			rest.callback(cb, null, mapDownload(providerName, download));
		},

		"del": function(req, cb) {
			download.cancel();
			rest.callback(cb);
		},

		"put": function(req, isPatch, cb) {
			if (!isPatch) {
				rest.callback(cb, rest.HTTPError.methodNotAllowed);
			} else {
				if ("action" in req.body) {
					if (req.body.action === "pause") {
						download.pause();
						return rest.callback(cb);
					}

					if (req.body.action === "resume") {
						download.resume();
						return rest.callback(cb);
					}
				} 

				rest.callback(cb, rest.HTTPError(400, "Bad request"));
			}
		}  
	};
}

exports.init = function(nestor) {
	var rest = nestor.rest;

	rest.resource("downloads", {
		"count": function(req, cb) {
			rest.callback(cb, null, Object.keys(providers).reduce(function(sum, name) {
				return sum + providers[name].downloadCount;
			}, 0));
		},

		"list": function(req, offset, limit, cb) {
			var list = Object.keys(providers).reduce(function(downloads, name) {
					return downloads.concat(providers[name].downloads.map(mapDownload.bind(null, name)));
				}, []);

			if (limit > 0) {
				list = list.slice(offset, offset + limit);
			} else {
				list = list.slice(offset);
			}

			rest.callback(cb, null, list);
		},

		"sub": function(name, cb) {
			if (name === "stats") {
				cb(null, {
					"get": function(req, cb) {
						rest.callback(cb, null, Object.keys(providers).reduce(function(stats, name) {
							var pstats = providers[name].stats;

							stats.active += pstats.active;
							stats.uploadRate += pstats.uploadRate;
							stats.downloadRate += pstats.downloadRate;

							return stats;
						}, { active: 0, uploadRate: 0, downloadRate: 0 }));
					}
				});
			} else if (name.indexOf(":") === -1) {
				cb();
			} else {
				var parts = name.split(":"),
					providerName = parts[0],
					id = parts[1],
					provider = providers[providerName];

				if (!provider) {
					cb();
				} else {
					var download = provider.getDownload(id);

					if (!download) {
						cb();
					} else {
						cb(null, getDownloadResource(rest, providerName, download));
					}
				}
			}
		},

		"post": function(req, cb) {
			var downloadUrl = req.body.url;
			var handled = Object.keys(providers).reduce(function(handled, name) {
					if (!handled) {
						if (providers[name].canDownload(downloadUrl)) {
							providers[name].addDownload(downloadUrl);
							return true;
						}
					}

					return false;
				}, false);

			if (handled) {
				rest.callback(cb);
			} else {
				rest.callback(cb, rest.HTTPError(400, "Bad request"));
			}
		}
	});

	return when.map(Object.keys(providers), function(name) {
		return providers[name].init(nestor.config.downloads);
	});
};

exports.manifest = {
	description: "Downloads",
	clientApps: [ "downloads" ]
};
