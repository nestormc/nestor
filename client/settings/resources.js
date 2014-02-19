/*jshint browser:true */
/*global define */

define(["rest"], function(rest) {
	"use strict";

	return {
		users: {
			get: function() {
				return rest.get("users", { limit: 0 });
			},

			remove: function(identifier) {
				return rest.del("users/" + identifier);
			},

			enable: function(identifier) {
				return rest.patch("users/" + identifier, { rights: ["nestor:login"] });
			}
		},

		rights: {
			get: function() {
				return rest.get("rights", { limit: 0 });
			}
		}
	};
});