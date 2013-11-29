/*jshint node:true */
"use strict";

var when = require("when"),
	mongoose = require("mongoose");


var VideoSchema = new mongoose.Schema({
	path: String,
	mime: String,

	title: String,
	year: Number,

	tags: [String]
});

VideoSchema.methods.getTagValues = function(name) {
	return this.tags.reduce(function(values, tag) {
		if (tag.indexOf(name + ":") === 0) {
			values.push(tag.substr(name.length + 1));
		}

		return values;
	}, []);
};

VideoSchema.virtual("show").get(function() {
	var values = this.getTagValues("show");
	return values.length ? values[0] : null;
});

VideoSchema.virtual("season").get(function() {
	var values = this.getTagValues("season");
	return values.length ? parseInt(values[0], 10) : null;
});

VideoSchema.virtual("episode").get(function() {
	var values = this.getTagValues("episode");
	return values.length ? parseInt(values[0], 10) : null;
});


var Video = mongoose.model("video", VideoSchema);


function getVideoData(meta) {
	var title;

	if (meta.metadata.title && meta.metadata.title.length > meta.filename.length) {
		title = meta.metadata.title;
	} else {
		title = meta.filename;
	}

	var data = {
		year: meta.metadata.year || -1,
		length: meta.format.duration,
		tags: []
	};

	// Clean up title
	data.title = title
		.replace(/\.(avi|divx|mpg|mpeg|mkv)$/i, "")
		.replace(/(dvdrip|xvid|divx|hdtv|bdrip|fastsub)/ig, "")
		.replace(/[_.]/g, " ");

	// Find show title, season and episode
	var m = data.title.match(/^(.*)s(\d+)e(\d+)(.*)$/i);
	if (m) {
		data.tags.push("show:" + m[1].trim());
		data.tags.push("season:" + parseInt(m[2], 10));
		data.tags.push("episode:" + parseInt(m[3], 10));
		data.title = m[4].trim();
	}

	return data;
}


/* Media analysis handler */
function analyzeFile(nestor, args, next) {
	var filepath = args.path,
		mimetype = args.mime,
		metadata = args.meta;

	if (mimetype.split("/")[0] !== "video") {
		return next();
	}

	var hasVideoStreams = metadata.streams.some(function(stream) {
		return stream.codec_type === "video";
	});

	if (!hasVideoStreams) {
		return next();
	}

	function error(action, err) {
		nestor.logger.error("Could not %s: %s", action, err.message || err);
		next(false);
	}

	var videodata = getVideoData(metadata);

	videodata.path = filepath;
	videodata.mime = mimetype;

	Video.findOne({ path: filepath }, function(err, video) {
		if (err) {
			return error("search video", err);
		}

		if (video) {
			video.update(videodata, function(err) {
				if (err) {
					return error("update video", err);
				}

				next(false);
			});
		} else {
			video = new Video(videodata);
			video.save(function(err, savedvideo) {
				if (err) {
					return error("save video", err);
				}

				[1, 2, 3].forEach(function(mult) {
					nestor.intents.dispatch("media.fetchCover", {
						key: "video:thumb-" + mult + ":" + savedvideo._id,
						hints: [{ type: "video", path: filepath, time: mult * metadata.format.duration / 4 }]
					});
				});
				
				next(false);
			});
		}
	});
}


exports.init = function(nestor) {
	nestor.intents.register("media.analyzeFile", analyzeFile.bind(null, nestor));

	nestor.rest.mongooseResource("videos", Video, {
		sort: { title: 1 },

		toObject: {
			virtuals: true,

			transform: function(doc, ret, options) {
				delete ret.__v;
				delete ret.id;
			}
		}
	});

	return when.resolve();
};

exports.manifest = {
	description: "Video library",
	deps: [ "media" ],
	clientApps: [ ]
};
