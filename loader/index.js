var _ = require("lodash");
var io = require("q-io/fs");
var path = require("path");
var async = require("async");

var Hapi = require("hapi");
var Server = new Hapi.Server();

var loader = function( done ){
	try {
		async.series([
			this.loadConfig,
			this.determineEnv,
			this.loadCollections,
			this.createConnection,
			this.addRouters,
			this.bootLoader,			
			this.startServer
		], function(err){
			console.log( err );
		});
	} catch (e){
		console.log(e);
	}


}

loader.prototype.loadConfig = function( done ){
	var config = {};
	io
		.listTree(path.join(process.cwd(), "config"), function( path, stat ){
			return path.split(".").pop() == "js";
		})
		.then(function(files){
			files.forEach( function(file){
				try {
					config = _.merge(config, require( file ));
				} catch(e){
					console.error(e);
				}
			});
			global.config = config;
			done();
		});
}

loader.prototype.loadCollections = function(done){
	config.logger.verbose("Loading Controllers");
	io
		.listTree(path.join(process.cwd(), "/api/controllers/"), function( path, stat ){
			return path.split(".").pop() == "js";
		})
		.then(function(files){
			files.forEach( function(file){
				try {
					var name = file.split("\\").pop().replace(".js", "");
						config.controllers[ name ] = require( file );					
				} catch(e){
					console.error(e);
				}
			});
			done();
		});
}

loader.prototype.addRouters = function( done ){
	config.logger.verbose("Binding Routers");

	for ( var key in config.routes ){
		var route = config.routes[key];

		if ( !(config.controllers[ route.split(".").shift() ] )){
			config.logger.error( "Cant Bind Route %s to Handler", route.split(".").shift());
		} else {
			//we can bind it...
			var method = key.split(/\s/gi).shift();
			var path = key.split(/\s/gi).pop();

			if ( method.charAt(0) == "/"){
				path = method;
				method = "*";
			}

			var controller = route.split(".").shift();
			var callback = route.split(".").pop();

			config.logger.verbose( "binding %s:%s", method, path ); 

			var handler = config.controllers[ controller ][ callback ];

			if (!handler){
				config.logger.warn("No Handler Detected!");
			}

			if ( path.charAt(0) != "/") {
				path = "/" + path;
			}

			try {
				Server.route({
					method: method,
					path: path,
					handler: handler
				});
			} catch (e){
				config.logger.error( e.message, e);
			}
		}
	}

	done();
}

loader.prototype.determineEnv = function(done){
	var env = "development";

	try {
		config.env = require(path.join(process.cwd(), "/config/env", env + ".js"));
	} catch(e){
		config.logger.error("Cant load enviroment file", e);
		return done(e);
	}	

	try {
		global.config = _.merge( config, config.env[env]);

		config.enviroment = env;
	} catch (e){
		config.logger.error("Cant Merge New Config", e);
		return done(e);
	}

	done();
}


loader.prototype.createConnection = function(done){
	Server.connection({
		host: config.host || "localhost",
		port: config.port || 8080
	});

	done();
}

loader.prototype.bootLoader = function( done ){
	timer = setTimeout(function(){
		done(new Error("Boot Loader took too long to boot"));		
	}, 3000);
	try {
		config.bootstrap(function(){
			clearTimeout(timer);
			done();
		});
	} catch( err ){
		done(err);
	}

}


loader.prototype.startServer = function(done){
	Server.start(function(err){
		if (err){
			throw err;
		}
		console.log('Server running at:', Server.info.uri);
	});
}


module.exports = loader;