/*jshint node:true */

"use strict";

var crypto = require("crypto"),
	mongoose = require("mongoose"),
	passport = require("passport"),
	LocalStrategy = require("passport-local").Strategy,
	GoogleStrategy = require("passport-google").Strategy,
	TwitterStrategy = require("passport-twitter").Strategy,
	yarm = require("yarm"),

	config = require("./config").auth,
	logger = require("log4js").getLogger("auth");


var AdminUser = {
	identifier: "admin",

	displayName: "admin",

	validatePassword: function(password) {
		return config.admin.password === password;
	},

	hasRight: function() {
		return !config.admin.disabled;
	}
};


var UserSchema = new mongoose.Schema({
	identifier: String,

	lastLogin: Date,
	displayName: { type: String, default: "" },
	authData: { type: String, default: "" },

	policy: { type: String, default: "deny" },
	rights: [String]
});

UserSchema.methods.hasRight = function(right) {
	if (this.policy === "allow") {
		return this.rights.indexOf(right) === -1;
	} else {
		return this.rights.indexOf(right) !== -1;
	}
};

UserSchema.methods.validatePassword = function(password) {
	var parts = this.authData.split(":"),
		salt = parts[0],
		hashed = parts[1];

	return crypto.createHmac("sha1", salt).update(password).digest("base64") === hashed;
};

UserSchema.methods.setPassword = function(password) {
	var salt = crypto.randomBytes(32).toString("base64");
	var hashed = crypto.createHmac("sha1", salt).update(password).digest("base64");

	this.authData = salt + ":" + hashed;
};

UserSchema.virtual("provider").get(function() {
	return this.identifier.split(":")[0];
});

UserSchema.virtual("userid").get(function() {
	var userid = this.identifier.replace(/^[^:]+:/, "");
	
	if (this.provider === "twitter") {
		return "@" + userid;
	} else {
		return userid;
	}
});

var User = mongoose.model("user", UserSchema);


function findLocalUser(username, cb) {
	if (username === "admin") {
		process.nextTick(function() { cb(null, AdminUser); });
	} else {
		User.findOneAndUpdate(
			{ identifier: "local:" + username },
			{ lastLogin: new Date() },
			{},
			cb
		);
	}
}


function handleAuthentification(strategy, req, res, next) {
	passport.authenticate(strategy, function(err, user, info) {
		if (err) {
			return next(err);
		}

		if (!user) {
			logger.debug("Login failed from %s: %j", req.ip, info);

			if (strategy === "local") {
				return res.send(401, "Not authorized");
			} else {
				return res.redirect("/?error=not-authorized");
			}
		}

		logger.debug("Login successful from %s for user %j", req.ip, user);

		req.login(user, function(err) {
			if (err) {
				return next(err);
			}

			if (user === AdminUser) {
				logger.warn("Admin login from %s", req.ip);
			}

			if (strategy === "local") {
				// Send JSON response
				res.send(200, { user: user.displayName });
			} else {
				// Redirect to root
				res.redirect("/");
			}
		});
	})(req, res, next);
}


module.exports = {
	init: function(app, host) {
		yarm.mongooseResource("users", User, {
			key: "identifier",

			toObject: {
				virtuals: true,

				transform: function(doc, ret, options) {
					delete ret._id;
					delete ret.__v;
				}
			}
		});

		app.use(passport.initialize());
		app.use(passport.session());

		app.post("/auth/login", function(req, res, next) {
			handleAuthentification("local", req, res, next);
		});

		app.get("/auth/google", passport.authenticate("google"));
		app.get("/auth/google/return", function(req, res, next) {
			handleAuthentification("google", req, res, next);
		});

		app.get("/auth/twitter", passport.authenticate("twitter"));
		app.get("/auth/twitter/return", function(req, res, next) {
			handleAuthentification("twitter", req, res, next);
		});

		app.get("/auth/logout", function(req, res, next) {
			req.logout();
			res.send(204);
		});

		app.get("/auth/status", function(req, res, next) {
			if (req.isAuthenticated()) {
				res.send({ user: req.user.displayName });
			} else {
				res.send({});
			}
		});

		passport.serializeUser(function(user, done) {
			done(null, user.identifier);
		});

		passport.deserializeUser(function(id, done) {
			if (id === "admin") {
				done(null, AdminUser);
			} else {
				User.findOne({ identifier: id }, done);
			}
		});

		passport.use(new LocalStrategy(
			function (username, password, done) {
				logger.debug("Local auth attempt for user %s", username);

				findLocalUser(username, function(err, user) {
					if (err) {
						return done(err);
					}

					if (!user) {
						return done(null, false, { message: "Unknown user" });
					}

					if (!user.validatePassword(password)) {
						return done(null, false, { message: "Invalid password" });
					}

					if (!user.hasRight("nestor:login")) {
						return done(null, false, { message: "Unauthorized user" });
					}

					done(null, user);
				});
			}
		));

		passport.use(new GoogleStrategy(
			{
				returnURL: host + "/auth/google/return",
				realm: host
			},
			function (id, profile, done) {
				logger.debug("Return from google auth with id %s and profile %j", id, profile);
				User.findOneAndUpdate(
					{ identifier: "google:" + profile.emails[0].value },
					{ displayName: profile.displayName, lastLogin: new Date() },
					{ upsert: true },
					function(err, user) {
						if (err) {
							return done(err);
						}

						if (!user.hasRight("nestor:login")) {
							return done(err, false, { message: "Unauthorized user" });
						}

						done(null, user);
					}
				);
			}
		));

		passport.use(new TwitterStrategy(
			{
				consumerKey: config.twitter.key,
    			consumerSecret: config.twitter.secret,
    			callbackURL: host + "/auth/twitter/return"
			},
			function (token, tokenSecret, profile, done) {
				logger.debug("Return from twitter auth with token %s, secret %s and profile %j", token, tokenSecret, profile);
				User.findOneAndUpdate(
					{ identifier: "twitter:" + profile.username },
					{ displayName: profile.displayName, lastLogin: new Date() },
					{ upsert: true },
					function(err, user) {
						if (err) {
							return done(err);
						}

						if (!user.hasRight("nestor:login")) {
							return done(err, false, { message: "Unauthorized user" });
						}

						done(null, user);
					}
				);
			}
		));
	}
};
