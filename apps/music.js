/*jshint node:true */
'use strict';

var mongoose = require('mongoose'),
	ffprobe = require('node-ffprobe'),
	util = require('util'),
	when = require('when'),

	TrackSchema, Track,
	
	analyzeFile;

	
/* Model definition */

TrackSchema = new mongoose.Schema({
	file: { type: String, unique: true },
	artists: [String],
	title: String,
	album: String,
	number: Number,
	year: Number,
	
	format: String,
	bitrate: Number,
	duration: Number,

	lastmod: Date
});

TrackSchema.pre('save', function(next) {
	this.lastmod = new Date();
	next();
});

Track = mongoose.model('track', TrackSchema);


analyzeFile = function(args, next) {
	var nestor = this,
		path = args.path;
	
	ffprobe(path, function ffprobeHandler(err, data) {
		var meta, track;
		
		if (err) {
			nestor.logger.error("Could not probe file %s: %s", path, err.message);
			next();
			return;
		}
		
		if (!data.streams || data.streams.length != 1 || data.streams[0].codec_type !== 'audio') {
			nestor.logger.warn("Unknown file type %s", path);
			next();
		} else {
			meta = data.metadata || { title: '', artist: '', album:	'', track: '', date: '' };
			track = {
				file: path,
				title: meta.title || '',
				artists: meta.artist ? [meta.artist] : [],
				album: meta.album || '',
				number: parseInt(meta.track, 10),
				year: parseInt(meta.date, 10),
				
				format: data.format.format_name,
				bitrate: data.format.bit_rate,
				duration: data.format.duration
			};
			
			if (isNaN(track.number)) {
				track.number = -1;
			}
			
			if (isNaN(track.year)) {
				track.year = -1;
			}
			
			Track.findOneAndUpdate(
				{ file: path }, track, { upsert: true },
				function saveHandler(err) {
					if (err) {
						nestor.logger.error("Could not save track %s in database: %s", path, err.message);
					}
					
					// File has been processed
					next(false);
				}
			);
		}
	});
};


exports.init = function(nestor) {
	nestor.intents.register('media.analyzeFile', analyzeFile.bind(nestor));
	
	nestor.server.mongooseResource('tracks', Track);
	nestor.server.mongooseAggregate('albums', Track, [
		{ $project: {
			artists: 1,
			year: 1,
			title: '$album'
		} },
		{ $sort: { number: 1 } },
		{ $group: {
			_id: '$title',
			artists: { $addToSet: '$artists' },
			tracks: { $addToSet: '$_id' },
			years: { $addToSet: '$year' }
		} }
	]);
	
	return when.resolve();
};

exports.manifest = {
	description: "Music library",
	deps: [ 'media' ],
	clientApps: [ 'music' ]
};
