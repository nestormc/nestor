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
					fields[name].value = values[name];
				}
			});
		}

		options.behaviour = {
			"input[type=submit]": {
				"click": function() {
					var values = getValues();
					var errors = options.fields.reduce(function(count, field) {
						if ("validate" in field) {
							var error = field.validate(values[field.name]);

							if (error) {
								fields[name].classList.add("error");
								count++;
							} else {
								fields[name].classList.remove("error");
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

		root = dom.$(rendered, ".form");
		options.fields.forEach(function(field) {
			if (field.type !== "label") {
				fields[field.name] = dom.$(root, "[name='" + field.name + "']");
			}
		});

		return rendered;
	};
});