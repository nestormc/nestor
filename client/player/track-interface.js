/* Interface for player tracks

   General notes:

   - implementations should not rely on interface signals internally, as their
     behaviour can be altered by the player (eg. memorize, forget, removeAll);
     use private signals instead.

   - the dispose() method indicates that the player does not intend to use the
     track anymore.  Implementations should dispose interface signals, and
     prevent any further network activity, memory usage or promise updates.

 */

{
	/* Preload */

	// Called with true to start loading track, indicating that the player
	// intends to play the track soon.
	// Called with false to stop loading track, indicating that the player
	// does not intend to play the track soon.  If possible, network activity
	// should be suspended or throttled down, as an other track is likely
	// to need loading.
	preload: function(canPreload) {},



	/* Track data */

	// Dispatched when playback position changed, with current time position
	// in seconds
	timeChanged: instanceof Signal,

	// Dispatched when total length changed, with total length in seconds
	lengthChanged: instanceof Signal,

	// Should resolve to { title, subtitle } (subtitle is optional)
	metadata: instanceof Promise,

	// Should resolve to DOM element
	display: instanceof Promise,



	/* Lifecycle */

	// Called to tell the track where to play.  The 'controller' argument is
	// either "display" when the track is expected to play inside its display
	// DOM element, or a CastController object when a ChromeCast session is
	// active.
	// The track should not actually play or preload any media before cast() has
	// been called.  It will be called once before any preload() or play() call,
	// and can be called later when the user wants to switch playback between
	// the local player and a ChromeCast session.
	cast: function(controller) {},

	// Called when track will not be used by player anymore.
	dispose: function() {},



	/* Playback */

	// Called to start or resume playback, will never be called before playable
	// has been dispatched
	play: function() {},

	// Called to stop playback, will never be called before playable has been
	// dispatched
	pause: function() {},

	// Called to seek to a specific timestamp in seconds.  Calling seek should
	// not affect playback state, ie. it should neither start playback nor
	// pause it.  May be called before playable has been dispatched, or even
	// before load has been called.
	seek: function(timestamp) {},

	// Dispatched when playback reached end of track
	ended: instanceof Signal
}