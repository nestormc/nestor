/*jshint node:true */
"use strict";

var express = require("express"),
	lessMiddleware = require("less-middleware"),
	yarm = require("yarm"),
	logger = require("log4js").getLogger("server"),
	MongoStore = require("connect-mongo")(express),
	
	config = require("./config"),
	serverConfig = config.server,

	intents = require("./intents"),
	share = require("./share"),
	auth = require("./auth"),
	
	app = express();


function lessPreprocessor(importDefs, src, req) {
	if (importDefs) {
		src = "@import \"defs.less\";\n" + src;
	}

	if (req.param("namespace")) {
		src = req.param("namespace") + " { " + src + " } ";
	}
	
	return src;
}


/* Basic express serverConfiguration */
app.use(express.cookieParser());
app.use(express.session({
	secret: serverConfig.cookieSecret,
	cookie: {
		maxAge: 1000 * 60 * 60 * 24 * (serverConfig.sessionDays || 2)
	},
	store: new MongoStore({ url: config.database })
}));


/* Serve LESS-compiled CSS from client/ */
app.use(lessMiddleware({
	src: __dirname + "/../../client",
	force: true,
	preprocessor: lessPreprocessor.bind(null, false)
}));

/* Serve static files from client/ */
app.use(express.static(__dirname + "/../../client"));

/* Plugin  */
var plugins = [];
yarm.native("plugins", plugins).readonly(true);


/* Auth handler */
app.use("/auth", express.json());
auth.init(app, "http://" + serverConfig.host + ":" + serverConfig.port);

/* Heartbeat handler, can be used to check for connectivity with nestor */
app.use("/heartbeat", function(req, res) {
	res.send(204);
});

/* Log REST requests */
app.use("/rest", function(req, res, next) {
	if (req.body && Object.keys(req.body).length > 0) {
		logger.debug("%s %s %j", req.method, req.url, req.body);
	} else {
		logger.debug("%s %s", req.method, req.url);
	}
	
	next();
});

/* Serve YARM rest resources */
app.use("/rest", express.json());
app.use("/rest", yarm());

/* Override Buffer toJSON, just in case yarm sends an object with a huge buffer */
Buffer.prototype.toJSON = function() {
	return "[Buffer]";
};

/* Downloads */
app.get("/download/:shortId", function(req, res, next) {
	share.pipeShortIdStream(req, req.params.shortId, function(name) {
		res.setHeader("Content-Type", "application/octet-stream");
		res.setHeader("Content-Disposition", "attachment; filename=\"" + name.replace(/"/g, "\\\"") + "\"");
	}, res, function(err) {
		if (err) {
			res.send(404, "Not found");
		}
	});
});

app.get("/download/:provider/:resource", function(req, res, next) {
	share.pipeDownloadStream(req.params.provider, req.params.resource, function(name) {
		res.setHeader("Content-Type", "application/octet-stream");
		res.setHeader("Content-Disposition", "attachment; filename=\"" + name.replace(/"/g, "\\\"") + "\"");
	}, res, function(err) {
		if (err) {
			res.send(404, "Not found");
		}
	});
});

/* Catchall error handler */
app.use(function errorHandler(err, req, res, next) {
	logger.error("Unhandled exception: %s\n%s", err.message, err.stack);
});


intents.on("nestor:startup", function() {
	/* Launch HTTP server */
	logger.info("Starting HTTP server on %s:%s", serverConfig.host, serverConfig.port);
	app.listen(serverConfig.port, serverConfig.host);
});


module.exports = {
	registerPlugin: function(name, dir) {
		plugins.push(name);

		app.use("/plugins/" + name, lessMiddleware({
			src: dir,
			force: true,
			paths: [__dirname + "/../../client/style"],
			preprocessor: lessPreprocessor.bind(null, true)
		}));

		app.use("/plugins/" + name, express.static(dir));
	}
};
