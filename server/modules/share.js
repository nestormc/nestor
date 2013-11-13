/*jshint node:true */

"use strict";

var crypto = require("crypto"),
	fs = require("fs"),
	logger = require("log4js").getLogger("share"),
	mongoose = require("mongoose"),
	path = require("path"),
	util = require("util"),
	yarm = require("yarm"),
	zipstream = require("zipstream");


/* Short ID generator (9 base64url-encoded random bytes) */
function shortId() {
	return crypto
		.randomBytes(9)
		.toString("base64")
		.replace(/\//g, "_")
		.replace(/\+/g, "-");
}


/* Shared resource model */

var ShareSchema = new mongoose.Schema({
	shortId: String,
	provider: String,
	resource: String,
	description: String,
	expires: Date,
	maxDownloads: { type: Number, default: -1 },
	downloadCount: { type: Number, default: 0 },
	disabled: { type: Boolean, default: false }
});

ShareSchema.methods.canSend = function() {
	if (new Date() > this.expires || this.disabled) {
		return false;
	}

	if (this.maxDownloads !== -1) {
		if (this.downloadCount >= this.maxDownloads) {
			return false;
		}

		this.downloadCount++;
		this.save();
	}

	return true;
};

var Share = mongoose.model("share", ShareSchema);


/* Stream builder for resource providers */

function DownloadStreamBuilder() {
	this.files = [];
	this.downloadName = null;
}

DownloadStreamBuilder.prototype = {
	_buildFileList: function(cb) {
		var builder = this,
			files = [];

		function nextDirItem(basename, dirpath, items, cb) {
			var item = items.pop();

			if (item) {
				fs.stat(path.join(dirpath, item), function(err, stat) {
					if (err) {
						cb(err);
						return;
					}

					if (stat.isDirectory()) {
						parseDirectory(path.join(basename, item), path.join(dirpath, item), function(err) {
							if (err) {
								cb(err);
								return;
							}

							nextDirItem(basename, dirpath, items, cb);
						});
					} else {
						files.push({
							name: path.join(basename, item),
							type: "file",
							path: path.join(dirpath, item)
						});

						nextDirItem(basename, dirpath, items, cb);
					}
				});
			} else {
				cb();
			}
		}

		function parseDirectory(basename, dirpath, cb) {
			fs.readdir(dirpath, function(err, items) {
				if (err) {
					cb(err);
					return;
				}

				nextDirItem(basename, dirpath, items, cb);
			});
		}

		function nextFile(err) {
			if (err) {
				cb(err);
				return;
			}

			var file = builder.files.pop();

			if (file) {
				if (file.type === "dir") {
					parseDirectory(file.name, file.path, files, nextFile);
				} else {
					files.push(file);
					process.nextTick(nextFile);
				}
			} else {
				cb(null, files);
			}
		}

		nextFile();
	},

	addContent: function(name, content) {
		this.files.push({
			name: name,
			type: "raw",
			content: content
		});
	},

	addFile: function(name, filepath) {
		this.files.push({
			name: name,
			type: "file",
			path: filepath
		});
	},

	addDirectory: function(name, dirpath) {
		this.files.push({
			name: name,
			type: "dir",
			path: dirpath
		});
	},

	setDownloadFilename: function(name) {
		this.downloadName = name;
	},

	get name() {
		if (this.downloadName) {
			return this.downloadName;
		} else if (this.files.length === 1) {
			if (this.files[0].type === "dir") {
				return this.files[0].name + ".zip";
			} else {
				return this.files[0].name;
			}
		} else {
			return "download.zip";
		}
	},

	pipe: function(outStream, cb) {
		this._buildFileList(function(err, files) {
			var zip;

			if (err) {
				cb(err);
				return;
			}

			function nextFile() {
				var file = files.pop();

				if (file) {
					logger.debug("Zip: adding %s %s", file.type, file.name);
					zip.addFile(
						file.type === "file" ? fs.createReadStream(file.path) : file.content,
						{ name: file.name },
						nextFile
					);
				} else {
					logger.debug("Zip: finalizing");
					zip.finalize();
				}
			}

			if (files.length === 1) {
				if (files[0].type === "file") {
					fs.createReadStream(files[0].path).pipe(outStream);
				} else if (files[0].content instanceof Buffer) {
					outStream.end(files[0].content);
				} else {
					outStream.end(files[0].content, "utf8");
				}
			} else {
				zip = zipstream.createZip({ level: 1 });
				zip.pipe(outStream);

				nextFile();
			}
		});
	}
};

var handlers = {};


function getResourceURI(req, provider, resource) {
	return util.format("%s://%s/download/%s/%s",
		req.protocol,
		req.headers.host,
		provider,
		resource
	);
}

function pipeDownloadStream(provider, resource, setName, outStream, cb) {
	var builder = new DownloadStreamBuilder();

	if (!(provider in handlers)) {
		logger.warn("Attempted dowload from unknown provider %s", provider);
		cb(new Error("Unknown provider"));
		return;
	}

	handlers[provider](resource, builder, function(err) {
		if (err) {
			logger.warn("Provider error when downloading %s/%s: %s", provider, resource, err.message);
			cb(err);
			return;
		}

		setName(builder.name);
		builder.pipe(outStream, cb);
	});
}


module.exports = {
	init: function() {
		yarm.mongooseResource("share", Share, { key: "shortId" });
	},

	registerShareHandler: function(provider, handler) {
		handlers[provider] = handler;

		return {
			getURI: function(req, resource) {
				return module.exports.getResourceURI(req, provider, resource);
			}
		};
	},

	getResourceURI: getResourceURI,
	pipeDownloadStream: pipeDownloadStream,

	pipeShortIdStream: function(req, shortId, setName, outStream, cb) {
		Share.findOne({ shortId: shortId }, function(err, share) {
			if (err || !share) {
				logger.warn("Attempted dowload of unknown resource %s", shortId);
				cb(new Error("Cannot find resource"));
			} else {
				if (share.canSend(req)) {
					pipeDownloadStream(share.provider, share.resource, setName, outStream, cb);
				}
			}
		});
	}
};
