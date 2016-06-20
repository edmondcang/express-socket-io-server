var express = require('express');
var path = require('path');
var favicon = require('serve-favicon');
var logger = require('morgan');
var cookieParser = require('cookie-parser');
var bodyParser = require('body-parser');

var routes = require('./routes/index');
var users = require('./routes/users');

var appHttps = express();

// view engine setup
appHttps.set('views', path.join(__dirname, 'views'));
appHttps.set('view engine', 'ejs');

// uncomment after placing your favicon in /public
//appHttps.use(favicon(path.join(__dirname, 'public', 'favicon.ico')));
appHttps.use(logger('dev'));
appHttps.use(bodyParser.json());
appHttps.use(bodyParser.urlencoded({ extended: false }));
appHttps.use(cookieParser());
appHttps.use(express.static(path.join(__dirname, 'public')));

// Add headers
appHttps.use(function (req, res, next) {

  // Website you wish to allow to connect
  res.setHeader('Access-Control-Allow-Origin', '*');
  
  // Request methods you wish to allow
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, PATCH, DELETE');
  
  // Request headers you wish to allow
  res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With,content-type');
  
  // Set to true if you need the website to include cookies in the requests sent
  // to the API (e.g. in case you use sessions)
  res.setHeader('Access-Control-Allow-Credentials', true);
  
  // Pass to next layer of middleware
  next();
});

appHttps.use('/', routes);
appHttps.use('/users', users);

// catch 404 and forward to error handler
appHttps.use(function(req, res, next) {
  var err = new Error('Not Found');
  err.status = 404;
  next(err);
});

// error handlers

// development error handler
// will print stacktrace
if (appHttps.get('env') === 'development') {
  appHttps.use(function(err, req, res, next) {
    res.status(err.status || 500);
    res.render('error', {
      message: err.message,
      error: err
    });
  });
}

// production error handler
// no stacktraces leaked to user
appHttps.use(function(err, req, res, next) {
  res.status(err.status || 500);
  res.render('error', {
    message: err.message,
    error: {}
  });
});


module.exports = appHttps;
