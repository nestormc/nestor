/*jshint browser:true*/
/*global define*/
define(["ist", "dom"], function(ist, dom) {
	"use strict";

	/* options = {
	 *   // Specify form title, defaults to no title
	 *   title: "My form",
	 *
	 *   // Specify submit button label, defaults to "Submit"
	 *   submitLabel: "submit",
	 *
	 *   // Specify cancel button label, defaults to no cancel button
	 *   cancelLabel: "cancel",
	 *
	 *   // Submit callback, mandatory
	 *   onSubmit: function(values) {
	 *     // values = { fieldName: fieldValue, ... }
	 *   },
	 *
	 *   // Cancel callback, mandatory if cancelLabel is specified
	 *   onCancel: function() {},
	 *
	 *   // Field definitions
	 *   fields: [
	 *     // Text field
	 *     { type: "text", name: "name", label: "label" },
	 *
	 *     // Number field with initial value
	 *     { type: "number", name: "name", label: "label", value: "42" },
	 *
	 *     // Select field
	 *     { type: "select", name: "name", label: "label", options: { value: "label", ... } },
	 *
	 *     // Hidden field
	 *     { type: "hidden", name: "name", value: "hidden value" },
	 *
	 *     // Only show field when other field has value "value"
	 *     { ..., when: { other: "value" } },
	 *
	 *     // Only show field when other field has value "foo" or "bar"
	 *     { ..., when: { other: ["foo", "bar"] } },
	 *
	 *     // Only show field when other field matches regexp
	 *     { ..., when: { other: /^foo|bar$/ } },
	 *
	 *     // Field with validator (only called when field is shown)
	 *     {
	 *       ...,
	 *       validate: function(value) {
	 *         if (!isValid(value)) { return "error message"; }
	 *       }
	 *     }
	 *   ]
	 * }
	 *
	 * Returns a DocumentFragment with the following helper methods:
	 *
	 *   getValues() returns { fieldName: fieldValue, ... }
	 *   setValues({ fieldName: fieldValue, ... }) sets fields values
	 *   focus() sets the focus to the first field
	 */
	return function form(options) {
		var rendered;
		var root;
		var fields = {};

		function getValues() {
			var values = {};

			options.fields.forEach(function(field) {
				if (field.type !== "label") {
					values[field.name] = fields[field.name].value;
				}
			});

			return values;
		}

		function setValues(values) {
			Object.keys(values).forEach(function(name) {
				if (name in fields) {
					var field = fields[name];
					var parent = field._parent;

					field.value = values[name];

					if (parent) {
						parent.classList.remove("error");

						var message = dom.$(parent, ".message");

						if (message) {
							message.textContent = "";
						}
					}
				}
			});

			updateFieldVisibility();
		}

		function updateFieldVisibility() {
			var values = getValues();

			options.fields.forEach(function(field) {
				if ("when" in field) {
					var parent = fields[field.name]._parent;

					parent.style.display =
						Object.keys(field.when).every(function(other) {
							var expected = field.when[other];
							var value = values[other];

							return value === expected ||
								Array.isArray(expected) && expected.indexOf(value) !== -1 ||
								expected instanceof RegExp && value.match(expected);
						}) ? "block" : "none";
				}
			});
		}

		options.behaviour = {
			"input, select": {
				"keyup": function(e) {
					if (e.keyCode === 13) {
						dom.$(root, "input[type=submit]").click();
					} else if (e.keyCode === 27) {
						var cancel = dom.$(root, "input.cancel[type=button]");
						if (cancel) {
							cancel.click();
						}
					}
				},

				"change": function() {
					updateFieldVisibility();

					if (this._parent) {
						this._parent.classList.remove("error");
					}
				}
			},

			"input[type=submit]": {
				"click": function() {
					var values = getValues();

					// Call validators for visible fields
					var errors = options.fields.reduce(function(count, field) {
						if (fields[field.name]._parent && fields[field.name]._parent.style.display === "block" && "validate" in field) {
							var error = field.validate(values[field.name]);
							var parent = fields[field.name]._parent;
							var message = dom.$(parent, ".message");

							if (error) {
								parent.classList.add("error");
								message.textContent = error;

								count++;
							} else {
								parent.classList.remove("error");
								message.textContent = "";
							}
						}

						return count;
					}, 0);

					if (errors === 0) {
						options.onSubmit(values);
					}
				}
			},

			"input.cancel[type=button]": {
				"click": function() {
					options.onCancel();
				}
			}
		};

		rendered = ist("@use 'form'").render(options);
		rendered.setValues = setValues;
		rendered.getValues = getValues;
		rendered.focus = function() {
			var first = options.fields.filter(function(field) {
				return field.type !== "label" && field.type !== "hidden" && !field.readonly;
			})[0];

			if (first) {
				fields[first.name].focus();
			}
		};

		root = dom.$(rendered, ".form");
		options.fields.forEach(function(field) {
			if (field.type !== "label") {
				var _field = fields[field.name] = dom.$(root, "[name='" + field.name + "']");
				_field._parent = dom.$P(_field, ".form-field");
				_field._options = field;
			}
		});

		updateFieldVisibility();

		return rendered;
	};
});