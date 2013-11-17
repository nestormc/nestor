/*jshint browser:true */
/*global define */

define(["rest"], function(rest) {
	"use strict";

	return {
		shares: {
			get: function() {
				return rest.get("shares", { limit: 0 });
			},

			add: function(description, provider, resource, enabled) {
				return rest.post("shares", { description: description, provider: provider, resource: resource, disabled: !enabled });
			},

			remove: function(key) {
				return rest.del("shares/" + key);
			},

			enable: function(key) {
				return rest.patch("shares/" + key, { disabled: false });
			},

			disable: function(key) {
				return rest.patch("shares/" + key, { disabled: true });
			}
		},

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
		}
	};
});