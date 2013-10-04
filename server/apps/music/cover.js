/*jshint node:true */

"use strict";

var mongoose = require("mongoose"),
	fs = require("fs"),
	path = require("path");


/**
 * Cover schema
 */

var CoverSchema = new mongoose.Schema({
	key: { type: String, index: true },
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
						var buffer = chain[chain.length - 1].cover;
						cb(null, new rest.ResponseBody(buffer, "image/jpeg"));
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