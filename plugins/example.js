var mongoose = require('mongoose'),
	Schema = mongoose.Schema,
	ObjectId = Schema.ObjectId;

/*
 * Mongoose-based nestor plugin example
 */


/* A simple model schema */
var personSchema = new Schema({
	name: String,
	age: Number,
	city: String
}); 
 

/* Plugin metadata */
exports.metadata = {
	title: "Example plugin",
	version: "1.0.0",
	author: "Nicolas Joyard",
	uri: "http://www.example.com"
};

/* Plugin registration function
	No actual processing should be done here, only feature registration.
*/
exports.register = function(nestor) {
	var log = nestor.logger;
	
	/* Register exit code */
	nestor.on('exit', function() {
		log.info("Unloading example plugin");
	});

	/* Resource publication */
	nestor.registerResources({
		person: {
			/* Mongoose schema; only necessary when using mongoose. If present, the
			   schema is registered by nestor when loading this plugin. */
			schema: personSchema,
			   
			/* Routes for /r/example/person/[route]. Each route has the following properties:
				- method: "GET" or "POST" ; optional, defaults to "GET".
				- route: string, Express route expression; a leading slash is ignored.
				- action: string, action name to perform when the route maches
				
			   Order matters: first routes are tried first.
			 */
			routes: [
				{ route: "/list", action: "list" },
				{ route: "/show/:id", action: "show" },
				{ route: "/create/:name/:age/:city", action: "create" }
			],
		
			/* Available actions. Each action is registered in nestors ACL and thus may
			   be individually allowed or disallowed for a specific user.
			   
			   All actions are called with the model as context (ie. 'this') when a route calling them
			   matches. They are specified as an object with keys 'type' (string) and 'code' (function).
			   
			   The following types are available:
			   - 'express' specifies that the action is an Express handler (accepting req, res, next
			     as parameters).
			   - 'cursor' specifies that the action returns a cursor-like object (ie. a mongoose
			     Query instance or an array). 'code' receives an Express request object and a callback
			     that can be called as :
			     	callback(new Error(...)) on error
			     	callback(null, CursorLikeObject) on success
			     	callback() when unable to handle the request (as calling next() in an Express handler) 
			     
			 */
			actions: {
				list: {
					type: 'cursor',
					code: function(req, callback) {
						callback(null, this.find());				
					}
				},
			
				/* Express handlers can be specified without the 'type' key */
				show: function(req, res, next) {
					var id = req.params.id;
					this.find({_id: id}, function(err, docs) {
						var person;
						
						if (err || docs.length === 0) {
							res.writeHead(404);
							res.end();
						} else {
							person = docs[0];
							res.end(person.name + ' aged '+ person.age + ' from ' + person.city);
						}
					});
				},
				
				create: function(req, res, next) {
					var Person = this,
						person = new Person();
						
					person.name = req.params.name;
					person.age = parseInt(req.params.age);
					person.city = req.params.city;
					
					person.save(function(err) {
						var uri = nestor.getRoute('person', '/show/' + person._id.toString());
						
						res.setHeader("Content-Type", "text/html");
						res.end("created <a href='" + uri + "'>" + person.name + "</a>");
					});
				}
			}
		}
	});
};

/* Plugin initialization function */
exports.init = function(nestor, callback) {
	var log = nestor.logger;
	
	log.info("Initializing example plugin");
	
	callback();
};

