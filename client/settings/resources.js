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
			},

			addRight: function(identifier, right) {
				return rest.post("users/" + identifier + "/rights", { _value: right });
			},

			delRight: function(identifier, right) {
				return rest.del("users/" + identifier + "/rights/" + right);
			}
		},

		rights: {
			get: function() {
				return rest.get("rights", { limit: 0 });
			}
		}
	};
});