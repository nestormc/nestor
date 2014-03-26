/*jshint browser:true */
/*global define */

define(["rest"], function(rest) {
	"use strict";

	return {
		users: {
			add: function(data) {
				return rest.post("users", data);
			},

			get: function() {
				return rest.get("users", { limit: 0 });
			},

			remove: function(identifier) {
				return rest.del("users/%s", identifier);
			},

			enable: function(identifier) {
				return rest.patch("users/%s", identifier, { rights: ["nestor:login"] });
			},

			addRight: function(identifier, right) {
				return rest.post("users/%s/rights", identifier, { _value: right });
			},

			delRight: function(identifier, right) {
				return rest.del("users/%s/rights/%s", identifier, right);
			}
		},

		rights: {
			get: function() {
				return rest.get("rights", { limit: 0 });
			}
		}
	};
});