/*jshint node:true */
"use strict";

var http = require("http"),
	https = require("https"),
	fs = require("fs"),
	express = require("express"),
	lessMiddleware = require("less-middleware"),
	yarm = require("yarm"),
	logger = require("log4js").getLogger("server"),
	MongoStore = require("connect-mongo")(express),
	
	config = require("./config"),
	serverConfig = config.server,

	intents = require("./intents"),
	auth = require("./auth"),
	
	app = express();


function lessPreprocessor(src, req) {
	src = "@import \"defs.less\";\n" + src;

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
	preprocessor: lessPreprocessor
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
		logger.debug("REST-%s %s %j", req.method, req.url, req.body);
	} else {
		logger.debug("REST-%s %s", req.method, req.url);
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

/* Catchall error handler */
app.use(function errorHandler(err, req, res, next) {
	logger.error("Unhandled exception: %s\n%s", err.message, err.stack);
});

/* Allow plugins to add GET routes with nestor:http:get intent.
   Plugins SHOULD prefer REST resources with yarm. But this can be used
   to achieve shorter URLs (I'm looking at you, nestor-share plugin) */
intents.on("nestor:http:get", function(route, handler) {
	app.get(route, handler);
});


intents.on("nestor:startup", function() {
	/* Launch HTTP server */

	if (serverConfig.ssl) {
		var sslOptions;

		try {
			sslOptions = {
				key: fs.readFileSync(serverConfig.ssl.keyFile),
				cert: fs.readFileSync(serverConfig.ssl.certFile)
			};
		} catch(e) {
			logger.error("Cannot start HTTPS server: %s", e.message);
			throw e;
		}

		logger.info("Starting HTTPS server on %s:%s", serverConfig.host, serverConfig.ssl.port);
		https.createServer(sslOptions, app).listen(serverConfig.ssl.port, serverConfig.host);
	}

	if (!serverConfig.ssl || !serverConfig.ssl.mandatory) {
		logger.info("Starting HTTP server on %s:%s", serverConfig.host, serverConfig.port);
		http.createServer(app).listen(serverConfig.port, serverConfig.host);
	}
});


module.exports = {
	registerPlugin: function(name, dir) {
		plugins.push(name);

		app.use("/plugins/" + name, lessMiddleware({
			src: dir,
			force: true,
			paths: [__dirname + "/../../client/style"],
			preprocessor: lessPreprocessor
		}));

		app.use("/plugins/" + name, express.static(dir));
	}
};
