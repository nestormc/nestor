/*jshint node:true */
"use strict";

var http = require("http"),
	https = require("https"),
	fs = require("fs"),
	path = require("path"),
	express = require("express"),
	lessMiddleware = require("less-middleware"),
	requirejs = require("requirejs"),
	yarm = require("yarm"),
	logger = require("log4js").getLogger("server"),
	MongoStore = require("connect-mongo")(express),
	
	config = require("./config"),
	serverConfig = config.server,

	intents = require("./intents"),
	auth = require("./auth"),
	
	app = express();



/*!
 * Common helpers
 */



function lessPreprocessor(src, req) {
	src = "@import \"defs.less\";\n" + src;

	if (req.param("namespace")) {
		src = req.param("namespace") + " { " + src + " } ";
	}
	
	return src;
}


function buildMiddleware(id, options) {
	return function(req, res, next) {
		logger.debug("Building " + id + " js");

		requirejs.optimize(
			options,
			function(output) {
				logger.debug("Build output for " + id + " js: \n%s", output);
				res.sendfile(options.out);
			},
			function(err) {
				logger.error("Build error for " + id + " js: %s", err);
				next(err);
			}
		);
	};
}



/*!
 * Session configuration and Authentication
 */



app.use(express.cookieParser());
app.use(express.session({
	secret: serverConfig.cookieSecret,
	cookie: {
		maxAge: 1000 * 60 * 60 * 24 * (serverConfig.sessionDays || 2)
	},
	store: new MongoStore({ url: config.database })
}));
app.use("/auth", express.json());
auth.init(app, "http://" + serverConfig.host + ":" + serverConfig.port);



/*!
 * Static client files
 */



var nestorRoot = path.normalize(path.join(__dirname, "../.."));
var staticDirectory = path.join(nestorRoot, "client");
var requirejsConfig = require(path.join(staticDirectory, "/js/require.config"));

app.use(lessMiddleware({
	src: staticDirectory,
	force: true,
	preprocessor: lessPreprocessor
}));


app.use("/js/require.js", function(req, res, next) {
	res.sendfile(path.join(nestorRoot, "node_modules/requirejs/require.js"));
});


var mainBuildMiddleware = buildMiddleware("main", {
	baseUrl: path.join(staticDirectory, "js"),
	name: "main",
	optimize: app.get("env") === "development" ? "none" : "uglify2",
	generateSourceMaps: true,
	out: path.join(path.join(staticDirectory, "js"), "main-built.js"),
	paths: requirejsConfig.paths,
	packages: requirejsConfig.packages,
	preserveLicenseComments: false
});


app.configure("development", function() {
	app.use("/js/main-built.js", mainBuildMiddleware);
});

app.use(express.static(staticDirectory));

app.configure("production", function() {
	app.use("/js/main-built.js", mainBuildMiddleware);
});



var plugins = [];
function registerPlugin(name, dir) {
	plugins.push(name);

	app.use("/plugins/" + name, lessMiddleware({
		src: dir,
		force: true,
		paths: [path.join(staticDirectory, "style")],
		preprocessor: lessPreprocessor
	}));


	var pluginBuildMiddleware = buildMiddleware(name, {
		baseUrl: path.join(dir, "js"),
		name: "index",
		optimize: app.get("env") === "development" ? "none" : "uglify2",
		generateSourceMaps: true,
		out: path.join(path.join(dir, "js"), "index-built.js"),
		paths: {
			"templates": "../templates",

			/* Path to ist to allow template compilation, but it will be stubbed in the output */
			"ist": path.join(staticDirectory, "js/bower/ist/ist"),

			/* Do not look for modules provided by the client plugin loader */
			"ui": "empty:",
			"router": "empty:",
			"storage": "empty:",
			"plugins": "empty:",
			"when": "empty:",
			"rest": "empty:",
			"dom": "empty:",
		},
		stubModules: ["ist"],
		preserveLicenseComments: false
	});

	app.configure("development", function() {
		app.use("/plugins/" + name + "/js/index-built.js", pluginBuildMiddleware);
	});

	app.use("/plugins/" + name, express.static(dir));

	app.configure("production", function() {
		app.use("/plugins/" + name + "/js/index-built.js", pluginBuildMiddleware);
	});
}



/*!
 * REST endpoints
 */



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

/* Plugin list */
yarm.native("plugins", plugins).readonly();



/*!
 * Misc handlers
 */


/* Heartbeat handler, can be used to check for connectivity with nestor */
app.use("/heartbeat", function(req, res) {
	res.send(204);
});

/* Catchall error handler */
app.use(function errorHandler(err, req, res, next) {
	logger.error("Unhandled exception: %s\n%s", err.message, err.stack);

	if (app.get("env") === "development") {
		res.send("<h1>" + err.message + "</h1><pre>" + err.stack + "</pre>");
	} else {
		res.send(500, "Internal server error");
	}
});



/*!
 * Intent handlers
 */



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
	registerPlugin: registerPlugin
};
