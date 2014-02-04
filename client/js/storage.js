/*jshint browser:true */
/*global define */

define([], function() {
	"use strict";

	var subStorages = {};
	var storage = {
		user: undefined,
		_prefix: "",

		_getKey: function(key) {
			if (!this.user) {
				throw new Error("Storage has not been bound to user");
			}

			return this.user + "/" + this._prefix + key;
		},

		set: function(key, value) {
			localStorage.setItem(this._getKey(key), value);
		},

		get: function(key, defaultValue) {
			return localStorage.getItem(this._getKey(key)) || defaultValue;
		},

		remove: function(key) {
			localStorage.removeItem(this._getKey(key));
		},

		subStorage: function(plugin) {
			var newPrefix = this._prefix + plugin + "/";

			if (!(newPrefix in subStorages)) {
				var sub = Object.create(this);
				sub._prefix = this._prefix + plugin + "/";

				subStorages[newPrefix] = sub;
			}

			return subStorages[newPrefix];
		}
	};

	return storage;
});