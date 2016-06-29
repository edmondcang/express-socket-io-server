var db1 = require('./db1');
var Helper = require('./Helper');

var Person = function () {
};

module.exports = (function () {
  var io = null;
  var timezoneAdjust = 8;
  var openTime = 1000;
  var closeTime = 1900;
  var numAnonymous = 0;
  var maxConn = 20;
  var total = 0;
  var numAvailable = [];
  var numAssigned = {};
  var loggedInUsers = [];
  var names = [];
  var persons = {};
  var rooms = {
    enquiry: {
      id: 'enquiry',
      name: 'Enquiry Room',
      persons: {}
    }
  };

  var _updateUserList = function () {
    db1.Q.fcall(
      db1.mkPromise(`
        SELECT * FROM persons WHERE type != 'admin'
      `)
    ).then(function (rows) {
      var res = rows[0];
      console.log(res);
      var sorted = [];
      var resOffline = [];
      for (var i in res) {
        for (var socket_id in rooms.enquiry.persons) {
          if (rooms.enquiry.persons[socket_id].client_key == res[i].client_key) {
            res[i].socket_id = socket_id;
          }
        }
        if (res[i].socket_id) {
          sorted.push(res[i]);
        }
        else {
          resOffline.push(res[i]);
        }
      }
      for (var i in resOffline) {
        sorted.push(resOffline[i]);
      }
      io.to(rooms.enquiry.id).emit('update-persons', sorted);
    });
  };

  for (var i = maxConn; i >= 1; i--) {
    numAvailable.push(i);
  }

  var _inTimeRange = function () {
    var d = new Date();
    var min = d.getMinutes();
    if (min < 10) min = '0' + min;
    var currentTime = parseInt('0' + (d.getHours() + timezoneAdjust) + min);
    console.log(currentTime);
    return (currentTime <= closeTime && currentTime >= openTime);
  };

  var _findPersonByClientId = function (client_id) {
    console.log('looking for ' + client_id);
    for (var socket_id in persons) {
      if (client_id == persons[socket_id].client_id) return persons[socket_id];
    }
    return null;
  };

  return {
    init: function (IO) {
      io = IO;

      io.on('connection', function (socket) {
        console.log('connected');
        if (total == maxConn) {
          socket.disconnect();
        }
        else {
          socket.emit('connection', { event: 'connection', accepted: true });
          total++;
        }

        socket.on('login', function (data) {
          //if (admins[data.name] && admins[data.name] == data.password) {
          if (data.name) {

            if (loggedInUsers.indexOf(data.name) > -1) {
              console.log(data.name + ' already logged in');
              console.log(loggedInUsers);
              return;
            }

            loggedInUsers.push(data.name);

            var person = new Person();
            person.client_key = data.client_key || Helper.keygen(32);
            person.client_id = data.client_id || Helper.keygen(32);
            person.socket_id = socket.id;
            person.name = data.name;
            person.type = 'admin';
            persons[socket.id] = person;

            socket.join(rooms.enquiry.id);
            rooms.enquiry.persons[socket.id] = person;

            socket.emit('logged-in', person);
            //socket.emit('logged-in', { client_key: person.client_key, socket_id: socket.id, name: person.name, room: rooms.enquiry.id });

            var d = new Date();
            //io.to(rooms.enquiry.id).emit('update', { msg: person.name + ' 加入', time: d.getHours() + ':' + d.getMinutes() });
            //io.to(rooms.enquiry.id).emit('update-persons', rooms.enquiry.persons);
            db1.Q.all([
              db1.mkPromise(`
                SELECT id FROM persons WHERE client_key = '${ person.client_key }'
              `)(),
            ]).then(function (rows) {
              var res = rows[0][0][0];
              if (!res) {
                db1.query(`
                  INSERT INTO persons SET name = '${ db1.escapeStr(person.name) }',
                  client_key = '${ person.client_key }',
                  client_id = '${ person.client_id }',
                  type = '${ db1.escapeStr(person.type) }'
                `, function (res) {
                  console.log(res);
                  _updateUserList();
                });
              }
              else {
                _updateUserList();
              }
            }).catch(function (e) {
              console.error(e);
            });
          }
        });

        socket.on('invite', function (data) {
          var invited = _findPersonByClientId(data.to);
          if (invited) {
            socket.broadcast.to(invited.socket_id).emit('invited', persons[socket.id]);
          }
          else {
            console.error('ERROR_EVENT_INVITE: no such person. client_id == ' + data.to);
          }

          // Load conversations with this person
          db1.Q.all([
            db1.mkPromise(`
              SELECT C.client_id_from, C.client_id_to, C.created_at, C.content, NULL as name FROM conversations C
              WHERE C.client_id_from = '${ data.from }' AND C.client_id_to = '${ data.to }'

              UNION ALL

              SELECT C.client_id_from, C.client_id_to, C.created_at, C.content, P.name FROM conversations C
                LEFT JOIN persons P ON ( P.client_id = C.client_id_from )
              WHERE C.client_id_to = '${ data.from }' AND C.client_id_from = '${ data.to }'

              ORDER BY created_at
            `)(),
          ]).then(function (rows) {
            var conversations = rows[0][0];
            console.log('conv', conversations);
            socket.emit('load conversations', conversations);
            var res = rows[0][0][0];
            console.log(res);
          }).catch(function (e) {
            console.error(e);
          });
        });

        socket.on('send', function (data) {
          console.log('send event', data);
          var d = new Date();
          if (data.to) {
            var receiver = _findPersonByClientId(data.to);
            if (receiver) {
              socket.broadcast.to(receiver.socket_id).emit('message', { from: persons[socket.id], content: data.content });
            }
            else {
              console.error('ERROR: no such person. client_id == ' + data.to);
            }
          }
          var toPerson = null;
          if (data.to == 'admin') {
            toPerson = 'admin';
          }
          else if (_findPersonByClientId(data.to)) {
            toPerson = data.to;
          }
          else if (typeof data.to == 'string' && data.to.length) {
            toPerson = data.to;
          }
          // TODO: send to the guy who once joined and has gone off line
          else {
            console.log('target is offline');
          }
          db1.Q.fcall(
            db1.mkPromise(`
                INSERT INTO conversations SET client_id_from = '${ persons[socket.id].client_id }', client_id_to = '${ toPerson }', content = '${ db1.escapeStr(data.content) }'
            `)
          ).then(function (res) {
            console.log(res);
          });
          socket.emit('message', { from: persons[socket.id], content: data.content, time: d.getHours() + ':' + d.getMinutes() });
        });

        socket.on('join', function (data) {
          console.log('join room', data);
          var newClient = false;

          // TODO: error handling
          if (names.indexOf(data.name) > -1) {
            console.error(`has person already ${ data.name }`);
            return;
          }

          var person = new Person();

          // client_key provided, this guy had connection before
          if (data.client_key && data.client_id) {
            person.client_key = data.client_key;
            person.client_id = data.client_id;
          }
          // New client_key assigned to those who make first time connection
          else {
            newClient = true;
            person.client_key = Helper.keygen(32);
            person.client_id = Helper.keygen(32);
          }

          person.socket_id = socket.id;

          //if (data.name && data.email) {
          if (data.name) {
            names.push(data.name);
            person.name = data.name;
            //person.email = data.email;
            person.type = 'user';
          }
          else {
            numAnonymous++;
            if (!numAssigned[person.client_key]) {
              var num = numAvailable.pop();
              numAssigned[person.client_key] = num;
              person.name = '訪客' + num;
            }
            else {
              person.name = '訪客' + numAssigned[person.client_key];
            }
            person.email = '';
            person.type = 'anonymous';
            person.assignation = num;
            console.log(numAvailable, numAssigned);
          }
          persons[socket.id] = person;

          db1.Q.all([
            db1.mkPromise(`
              SELECT id FROM persons WHERE client_key = '${ person.client_key }'
            `)(),
            db1.mkPromise(`
              SELECT C.client_id_from, C.client_id_to, C.created_at, C.content, NULL as name FROM conversations C
              WHERE C.client_id_from = '${ person.client_id }'

              UNION ALL

              SELECT C.client_id_from, C.client_id_to, C.created_at, C.content, P.name FROM conversations C
                LEFT JOIN persons P ON ( P.client_id = C.client_id_from )
              WHERE C.client_id_to = '${ person.client_id }'

              ORDER BY created_at
            `)(),
          ]).then(function (rows) {
            var conversations = rows[1][0];
            console.log('conv', conversations);
            socket.emit('load conversations', conversations);
            var res = rows[0][0][0];
            console.log(res);
            if (!res) {
              db1.query(`
                INSERT INTO persons SET name = '${ db1.escapeStr(person.name) }',
                client_key = '${ person.client_key }',
                client_id = '${ person.client_id }',
                type = '${ db1.escapeStr(person.type) }'
              `, function (res) {
                console.log(res);
                _updateUserList();
              });
            }
            else {
              _updateUserList();
            }
          }).catch(function (e) {
            console.error(e);
          });

          socket.join(rooms.enquiry.id);
          rooms.enquiry.persons[socket.id] = person;

          socket.emit('joined', { socket_id: person.socket_id, client_key: person.client_key, client_id: person.client_id, name: person.name, email: person.email, room: rooms.enquiry.id });

          //io.to(rooms.enquiry.id).emit('update', person.name + ' joined');
          io.to(rooms.enquiry.id).emit('update', { client_id: persons[socket.id].client_id, socket_id: socket.id, msg: persons[socket.id].name + ' 上線', type: 'user-status' });

          var d = new Date();
          var tStr = d.getHours() + ':' + d.getMinutes();

          if (!_inTimeRange()) {
            socket.emit('message', { from: { name: '' }, content: '抱歉！現在已經超出了我們的辦公時間\n\n請留下你的短訊，我們會盡快回覆你⋯⋯', time: tStr });
            return;
          }

          if (newClient && person.type != 'admin') {
            socket.emit('message', { from: { name: 'ShoppingGAI' }, content: '請問有甚麼問題需要幫忙嗎？', time: tStr });
          }
        });

        socket.on('clear storage', function () {
          db1.Q.fcall(
            db1.mkPromise(`
              DELETE FROM persons WHERE client_key = '${ persons[socket.id].client_key }'
            `)
          ).then(function (res) {
            console.log(res);
            _updateUserList();
          });

          console.log('clear storage');
          numAvailable.push(numAssigned[persons[socket.id].client_key]);
          delete numAssigned[persons[socket.id].client_key];
          console.log(numAvailable, numAssigned);
        });

        socket.on('disconnect', function () {
          console.log(numAvailable, numAssigned);
          if (persons[socket.id]) {
            if (persons[socket.id].type == 'admin') {
              loggedInUsers.splice(loggedInUsers.indexOf(persons[socket.id].name), 1);
            }
            else if (persons[socket.id].type == 'anonymous') {
              if (numAnonymous > 0)
                numAnonymous--;
            }
            console.log(persons[socket.id].name + ' disconnected');
            names.splice(names.indexOf(persons[socket.id].name), 1);
          }
          if (rooms.enquiry.persons[socket.id]) {
            var d = new Date();
            io.to(rooms.enquiry.id).emit('update', { client_id: persons[socket.id].client_id, socket_id: socket.id, msg: persons[socket.id].name + ' 離線', type: 'user-status' });
          }
          delete persons[socket.id];
          delete rooms.enquiry.persons[socket.id];
          //io.to(rooms.enquiry.id).emit('update-persons', rooms.enquiry.persons);
          _updateUserList();
          total--;
        });
      });
    }
  };
})();
