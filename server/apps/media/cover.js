/*jshint node:true */

"use strict";

var mongoose = require("mongoose"),
	fs = require("fs"),
	path = require("path"),
	ffmpeg = require("fluent-ffmpeg"),
	stream = require("stream"),

	wget = require("../../modules/wget");


/**
 * Cover schema
 */

var CoverSchema = new mongoose.Schema({
	key: { type: String, index: true },
	type: String,
	cover: Buffer
});

var Cover = mongoose.model("cover", CoverSchema);


/**
 * Cover fetching helpers
 */

var fetchFSCover = (function() {
	var searching = {};

	return function(logger, key, dir) {
		if (searching[key] && searching[key].length && searching[key].indexOf(dir) !== -1) {
			// Already looked/looking in this directory
			return;
		}

		searching[key] = searching[key] || [];
		searching[key].push(dir);

		fs.stat(path.join(dir, "/cover.jpg"), function(err, stat) {
			if (stat) {
				fs.readFile(path.join(dir, "/cover.jpg"), function(err, data) {
					if (!err) {
						var cover = new Cover({
							key: key,
							type: "image/jpeg",
							cover: new Buffer(data)
						});

						cover.save(function(err) {
							if (!err) {
								delete searching[key];
							}
						});
					}
				});
			}
		});
	};
}());

function fetchVideoCover(logger, key, path, time) {
	var passthrough = new stream.PassThrough();

	var buffers = [];
	var length = 0;

	passthrough.on("data", function(data) {
		buffers.push(data);
		length += data.length;
	});

	passthrough.on("end", function() {
		var cover = new Cover({
			key: key,
			type: "image/jpeg",
			cover: Buffer.concat(buffers, length)
		});

		cover.save();
	});

	(new ffmpeg({ source: path }))
		.setStartTime(Math.floor(time))
		.withNoAudio()
		.toFormat("image2")
		.takeFrames(1)
		.writeToStream(passthrough);
}

/**
 * Exports
 */

module.exports = {
	schema: CoverSchema,
	model: Cover,

	restSetup: function(rest) {
		rest.mongooseResource("covers", Cover, {
			key: "key",

			toObject: {
				virtuals: true,

				transform: function(doc, ret, options) {
					delete ret.__v;
					delete ret.id;
					delete ret.cover;
				}
			},

			overrides: {
				"covers/$": {
					get: function(chain, req, cb) {
						var cover = chain[chain.length - 1];
						cb(null, new rest.ResponseBody(cover.cover, cover.type));
					}
				},

				"covers": {
					post: function(chain, req, cb) {
						var key = req.body.key;

						Cover.remove({ key: key }, function(err) {
							if ("type" in req.body && "data" in req.body) {
								if (err) {
									cb(err);
								} else {
									var cover = new Cover({
										key: key,
										type: req.body.type,
										cover: new Buffer(req.body.data, "base64")
									});

									cover.save(function(err) {
										cb(err);
									});
								}
							} else if ("url" in req.body) {
								wget(req.body.url, function(err, type, buffer) {
									if (err) {
										cb(err);
									} else {
										var cover = new Cover({
											key: key,
											type: type,
											cover: buffer
										});

										cover.save(function(err) {
											cb(err);
										});
									}
								});
							}
						});
					}
				}
			}
		});
	},

	findCover: (function() {
		return function(logger, key, hints) {

			logger.debug("cover request for %s", key);
	
			Cover.findOne({ key: key }, function(err, cover) {
				if (err || cover) {
					// DB error or already existing cover
					return;
				}

				hints.forEach(function(hint) {
					if (hint.type === "directory") {
						fetchFSCover(logger, key, hint.path);
					} else if (hint.type === "video") {
						fetchVideoCover(logger, key, hint.path, hint.time);
					}
				});
			});
		};
	})()
};