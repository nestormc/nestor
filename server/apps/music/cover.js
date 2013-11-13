/*jshint node:true */

"use strict";

var mongoose = require("mongoose"),
	fs = require("fs"),
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

	fetchFSCover: (function() {
		var searching = {};

		return function(key, path) {
			Cover.findOne({ key: key }, function(err, cover) {
				if (err) {
					return;
				}

				if (cover) {
					// Cover exists for key
					return;
				}

				if (searching[key] && searching[key].length && searching[key].indexOf(path) !== -1) {
					// Already looked/looking in this directory
					return;
				}

				searching[key] = searching[key] || [];
				searching[key].push(path);

				fs.stat(path + "/cover.jpg", function(err, stat) {
					if (stat) {
						fs.readFile(path + "/cover.jpg", function(err, data) {
							if (!err) {
								cover = new Cover({
									key: key,
									type: "image/jpeg",
									cover: new Buffer(data)
								});

								cover.save();
							}
						});
					}
				});
			});
		};
	}())
};