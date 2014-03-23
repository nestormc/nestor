/*jshint browser:true*/
/*global define*/
define(["ist", "dom"], function(ist, dom) {
	"use strict";

	/* options = {
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
	 *     { type: "text", name: "name", label: "label", value: "value" },
	 *
	 *     // Number field
	 *     { type: "number", name: "name", label: "label", value: "42" },
	 *
	 *     // Select field
	 *     { type: "select", name: "name", label: "label", options: { value: "label", ... } },
	 *
	 *     // Hidden field
	 *     { type: "hidden", name: "name", value: "hidden value" },
	 *
	 *     // Field with validator
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
					var parent = dom.$P(field, ".form-field");
					var message = dom.$(parent, ".message");

					fields[name].value = values[name];
					parent.classList.remove("error");
					message.textContent = "";
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
				}
			},

			"input[type=submit]": {
				"click": function() {
					var values = getValues();
					var errors = options.fields.reduce(function(count, field) {
						if ("validate" in field) {
							var error = field.validate(values[field.name]);
							var parent = dom.$P(fields[field.name], ".form-field");
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
				fields[field.name] = dom.$(root, "[name='" + field.name + "']");
			}
		});

		return rendered;
	};
});