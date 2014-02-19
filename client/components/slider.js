/*jshint browser:true*/
/*global define*/

/*
 * This is greatly inspired from André Ruffert's rangeslider.js
 * https://github.com/andreruffert/rangeslider.js
 */

define(["ist!tmpl/components/slider", "signals", "dom"], function(sliderTemplate, signals, dom) {
	"use strict";

	var $ = dom.$;
	var touch = ("ontouchstart" in window) || window.DocumentTouch && document instanceof window.DocumentTouch;

	var startEvent = touch ? "touchstart" : "mousedown";
	var moveEvent = touch ? "touchmove" : "mousemove";
	var endEvent = touch ? "touchend" : "mouseup";

	var behaviour = { ".slider": {} };
	behaviour[".slider"][startEvent] = handleStart;

	var activeSlider;


	function setPositionFromEvent(e, isEnd) {
		var absX;
		if (typeof e.pageX !== undefined) {
			absX = e.pageX;
		} else if (e.originalEvent && e.originalEvent.changedTouches && e.originalEvent.changedTouches[0]) {
			absX = e.originalEvent.changedTouches[0].pageX || 0;
		}

		var relX = absX - dom.absoluteLeft(activeSlider);
		var rangeX = activeSlider.offsetWidth;


		var value = 0;

		if (rangeX > 0) {
			value = Math.max(0, Math.min(activeSlider._range, activeSlider._range * relX / rangeX));
		}

		activeSlider._value = value;
		update(activeSlider);

		if (activeSlider.live || isEnd) {
			activeSlider.changed.dispatch(value);
		}
	}


	function handleStart(e) {
		/*jshint validthis: true*/
		e.preventDefault();

		activeSlider = this;
		this.classList.add("moving");

		document.addEventListener(moveEvent, handleMove, false);
		document.addEventListener(endEvent, handleEnd, false);

		setPositionFromEvent(e);
	}


	function handleMove(e) {
		e.preventDefault();

		setPositionFromEvent(e);
	}


	function handleEnd(e) {
		e.preventDefault();

		setPositionFromEvent(e, true);

		activeSlider.classList.remove("moving");
		activeSlider = null;
		
		document.removeEventListener(moveEvent, handleMove, false);
		document.removeEventListener(endEvent, handleEnd, false);
	}


	function update(slider) {
		var pct = 0;

		if (slider._range > 0) {
			pct = 100 * slider._value / slider._range;
		}

		$(slider, ".fill").style.width = pct + "%";
		$(slider, ".handle").style.left = pct + "%";
	}


	function setAvailable(slider, available) {
		var pct = 0;

		if (slider._range > 0) {
			pct = 100 * available / slider._range;
		}

		$(slider, ".available").style.width = pct + "%";
	}


	function setRange(slider, range) {
		slider._range = range;
		update(slider);
	}


	function setValue(slider, value) {
		if (activeSlider === slider) {
			// Do not update if sliding
			return;
		}

		slider._value = value;
		update(slider);
	}


	function createSlider(range, value, available) {
		var slider = sliderTemplate.render({ behaviour: behaviour }).firstChild;

		slider._range = range || 1;
		slider._value = value || 0;
		slider.live = true;

		slider.setAvailable = setAvailable.bind(null, slider);
		slider.setRange = setRange.bind(null, slider);
		slider.setValue = setValue.bind(null, slider);
		slider.changed = new signals.Signal();

		slider.setAvailable(available || 0);
		update(slider);

		return slider;
	}


	return createSlider;
});