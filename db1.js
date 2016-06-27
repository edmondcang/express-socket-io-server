var mysql = require('mysql');
var Q = require('q');

var path = require('path');
var config = require('./config');
var connection;

var debug = true;

function handleDisconnect() {
	connection = mysql.createConnection(config.dbInfo);

	process.on('SIGINT', function () {
	  connection.end();
	  console.log('db disconnected');
	  process.exit();
	});

	connection.connect(function (err) {
	  if (err) {
	    console.log('error connecting: ' + err.stack);
	    return;
	  }   
	  console.log('mysql connected as id ' + connection.threadId);
	  console.log('database in use: ' + connection.config.database);
	});
	
	connection.on('error', function(err) {
	  console.log('db error', err);
	  if (err.code === 'PROTOCOL_CONNECTION_LOST') { 
	    handleDisconnect(); 
	  } else {
	    throw err;
	  } 
	});
}

function escapeObj(data) {
	console.log(typeof data);
	if (typeof data !== typeof Object()) return 0;
	for (var key in data) {
	  console.log('Escape '+key);
	  if (typeof data[key] === typeof String())
	    data[key] = escapeStr(data[key]);
	  else if (typeof data[key] === typeof Object()) {
	   escapeObj(data[key]);
	  }
	}
}
function escapeStr (str) {
	return str.replace(/[\0\x08\x09\x1a\n\r"'\\\%]/g, function (char) {
	  switch (char) {
	    case "\0":
	    return "\\0";
	    case "\x08":
	    return "\\b";
	    case "\x09":
	    return "\\t";
	    case "\x1a":
	    return "\\z";
	    case "\n":
	    return "\\n";
	    case "\r":
	    return "\\r";
	    case "\"":
	    case "'":
	    case "\\":
	    case "%":
	    return "\\"+char;
	  }
	});
} 

function mkPromise(sql) {
	debug && console.log(sql);
	return function () {
	  var defered = Q.defer();
	  connection.query(sql, defered.makeNodeResolver());
	  return defered.promise;
	}
}

handleDisconnect();

module.exports = {
	silence: function () {
	  debug = false;
	},
	query: function (sql, cb) {
	  debug && console.log(sql);
	  connection.query(sql, cb);
	},
	Q: Q,
	mkPromise: mkPromise,
	escapeStr: escapeStr,
	escapeObj: escapeObj,
};
