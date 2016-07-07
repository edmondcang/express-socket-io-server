var db1 = require('./db1');
var Helper = require('./Helper');

var Person = function () {
};

var Room = function (id, name) {
  this.id = id;
  this.name = name;
  this.persons = {};
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

  var _updateUserList = function (room) {
    room = room || 'enquiry';
    if (!rooms[room]) {
      rooms[room] = new Room(room, room);
    }
    io.to(rooms[room].id).emit('update-persons');
    console.log(rooms);
  };

  var _serveUserList = function (socketId) {
    if (!persons[socketId]) return;
    var room = persons[socketId].room || 'enquiry';
    db1.Q.fcall(
      db1.mkPromise(`
        SELECT P.*, C.content, C.type, C.created_at AS conv_created_at FROM persons P
          LEFT JOIN conversations C
            ON ( C.room = '${ room }' AND C.client_id_from = P.client_id AND (C.client_id_to = '${ persons[socketId].client_id }' OR C.client_id_to = 'admin') )
            OR ( C.room = '${ room }' AND C.client_id_from = '${ persons[socketId].client_id }' AND C.client_id_to = P.client_id )
          WHERE P.type != 'admin'
          ORDER BY conv_created_at DESC
      `)
    ).then(function (rows) {
      var res = rows[0];
      console.log(res);
      var sorted = [];
      var resOffline = [];
      var duplicated = 0;
      var objCounts = {};
      var clientIdList = [];
      for (var i in res) {
        if (clientIdList.indexOf(res[i].client_id) > -1) {
          objCounts[res[i].client_id] ? ++objCounts[res[i].client_id] : objCounts[res[i].client_id] = 1;
          continue;
        }
        clientIdList.push(res[i].client_id);
        for (var socket_id in rooms[room].persons) {
          if (rooms[room].persons[socket_id].client_key == res[i].client_key) {
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
      for (var i in sorted) {
        sorted[i].num_conv = objCounts[sorted[i].client_id] ? objCounts[sorted[i].client_id]+1 : 0;
      }
      io.sockets.connected[socketId].emit('serve user list', sorted);
    }).catch(function (e) {
      console.error(e);
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

        socket.on('request user list', function (data) {
          var room = data.room || 'enquiry';
          _serveUserList(data.socket_id, room);
        });

        socket.on('login', function (data) {
          //if (admins[data.name] && admins[data.name] == data.password) {
          if (data.name) {

            if (loggedInUsers.indexOf(data.name) > -1) {
              console.error('ERROR_ALREADY_LOGGED_IN', data.name);
              console.log(loggedInUsers);
              socket.emit('ERROR_ALREADY_LOGGED_IN');
              return;
            }

            loggedInUsers.push(data.name);

            var person = new Person();
            person.client_key = data.client_key || Helper.keygen(32);
            person.client_id = data.client_id || Helper.keygen(32);
            person.socket_id = socket.id;
            person.name = data.name;
            person.room = data.room;
            person.type = 'admin';
            persons[socket.id] = person;

            socket.join(rooms.enquiry.id);
            rooms.enquiry.persons[socket.id] = person;

            socket.emit('joined', person);
            //socket.emit('logged-in', person);
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
                  _updateUserList(person.room);
                });
              }
              else {
                _updateUserList(person.room);
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
              SELECT C.client_id_from, C.client_id_to, C.created_at, C.content, C.type, NULL AS name FROM conversations C
              WHERE C.client_id_from = '${ data.from }' AND C.client_id_to = '${ data.to }'

              UNION ALL

              SELECT C.client_id_from, C.client_id_to, C.created_at, C.content, C.type, P.name FROM conversations C
                LEFT JOIN persons P ON ( P.client_id = C.client_id_from )
              WHERE ( C.client_id_to = '${ data.from }' OR C.client_id_to = 'admin' ) AND C.client_id_from = '${ data.to }'

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
          //if (persons[socket.id].type == 'admin') {
          //  _serveUserList(socket.id);
          //}
          var d = new Date();
          if (data.to) {
            var receiver = _findPersonByClientId(data.to);
            if (receiver) {
              socket.broadcast.to(receiver.socket_id).emit('message', { from: persons[socket.id], content: data.content, type: data.type });
              //if (receiver.type == 'admin') {
              //  _serveUserList(receiver.socket_id);
              //}
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
          // Send to the guy who once joined and has gone off line
          else if (typeof data.to == 'string' && data.to.length) {
            toPerson = data.to;
          }
          // TODO: this is to admin
          else {
            console.log('to admin');
            toPerson = 'admin';
          }

          var room = persons[socket.id].room || 'enquiry';

          var promises = [];
          promises.push(
            db1.mkPromise(`
                INSERT INTO conversations SET client_id_from = '${ persons[socket.id].client_id }'
                  , room = '${ room }'
                  , client_id_to = '${ toPerson }'
                  , content = '${ db1.escapeStr(data.content) }'
                  ${ data.type ? ", type = '" + db1.escapeStr(data.type) + "'" : '' }
            `)()
          );
          db1.Q.all(promises).then(function (res) {
            console.log(res);
          });
          socket.emit('message', { from: persons[socket.id], content: data.content, type: data.type, time: d.getHours() + ':' + d.getMinutes() });
          _updateUserList(persons[socket.id].room);
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
          person.room = data.room || 'enquiry';

          //if (data.name && data.email) {
          if (data.name) {
            names.push(data.name);
            person.name = data.name;
            //person.email = data.email;
            person.type = 'user';
              // Free the number since this guys is nolonger anonymous
              var n = numAssigned[person.client_key];
              if (n && numAvailable.indexOf(n) < 0)
                numAvailable.push(n);
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

          console.log('who is this person ?', person);

          persons[socket.id] = person;

          db1.Q.all([
            db1.mkPromise(`
              SELECT * FROM persons WHERE client_key = '${ person.client_key }'
            `)(),
            db1.mkPromise(`
              SELECT C.client_id_from, C.client_id_to, C.created_at, C.content, C.type, NULL as name FROM conversations C
              WHERE C.client_id_from = '${ person.client_id }' AND C.room = '${ person.room }'

              UNION ALL

              SELECT C.client_id_from, C.client_id_to, C.created_at, C.content, C.type, P.name FROM conversations C
                LEFT JOIN persons P ON ( P.client_id = C.client_id_from )
              WHERE C.client_id_to = '${ person.client_id }' AND C.room = '${ person.room }'

              ORDER BY created_at
            `)(),
          ]).then(function (rows) {
            var conversations = rows[1][0];
            console.log('conv', conversations);
            socket.emit('load conversations', conversations);
            var res = rows[0][0][0];
            console.log('user', res);
            if (!res) {
              db1.query(`
                INSERT INTO persons SET name = '${ db1.escapeStr(person.name) }',
                client_key = '${ person.client_key }',
                client_id = '${ person.client_id }',
                type = '${ db1.escapeStr(person.type) }'
              `, function (res) {
                console.log(res);
                _updateUserList(person.room);
              });
            }
            else {
              if (person.name != res.name) {
                db1.query(`
                  UPDATE persons SET name = '${ person.name }' WHERE client_id = '${ person.client_id }'
                `, function (res) {
                  console.log(res);
                  _updateUserList(person.room);
                  // Free the number
                  var n = numAssigned[persons[socket.id].client_key];
                  if (n && numAvailable.indexOf(n) < 0)
                    numAvailable.push(n);
                });
              }
              else {
                _updateUserList(person.room);
              }
            }
          }).catch(function (e) {
            console.error(e);
          });

          var roomId = person.room || 'enquiry';
          if (!rooms[roomId]) {
            rooms[roomId] = new Room(roomId, roomId);
          }
          rooms[roomId].persons[socket.id] = person;

          socket.join(roomId);

          socket.emit('joined', {
            socket_id: person.socket_id, client_key: person.client_key, client_id: person.client_id, name: person.name, type: person.type, email: person.email, room: rooms[roomId].id
          });

          //io.to(rooms.enquiry.id).emit('update', person.name + ' joined');
          io.to(rooms[roomId].id).emit('update', { client_id: persons[socket.id].client_id, socket_id: socket.id, msg: persons[socket.id].name + ' 上線', type: 'user-status' });

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

        socket.on('typing', function (to_client_id) {
          var person = _findPersonByClientId(to_client_id);
          if (person) {
            socket.broadcast.to(person.socket_id).emit('typing');
          }
        });

        socket.on('clear typing', function (to_client_id) {
          var person = _findPersonByClientId(to_client_id);
          if (person) {
            socket.broadcast.to(person.socket_id).emit('clear typing');
          }
        });

        socket.on('clear storage', function () {
          if (!persons[socket.id]) return;
          db1.Q.fcall(
            db1.mkPromise(`
              DELETE FROM persons WHERE client_key = '${ persons[socket.id].client_key }'
            `)
          ).then(function (res) {
            console.log(res);
            _updateUserList(persons[socket.id].room);
          });

          console.log('clear storage');
          var n = numAssigned[persons[socket.id].client_key];
          if (n && numAvailable.indexOf(n) < 0)
            numAvailable.push(n);
          //numAvailable.push(numAssigned[persons[socket.id].client_key]);
          delete numAssigned[persons[socket.id].client_key];
          console.log(numAvailable, numAssigned);
        });

        socket.on('disconnect', function () {
          console.log(numAvailable, numAssigned);
          var room = 'enquiry';
          if (persons[socket.id]) {
            room = persons[socket.id].room || 'enquiry';
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
          if (rooms[room].persons[socket.id]) {
            var d = new Date();
            io.to(rooms[room].id).emit('update', { client_id: persons[socket.id].client_id, socket_id: socket.id, msg: persons[socket.id].name + ' 離線', type: 'user-status' });
          }
          delete persons[socket.id];
          delete rooms[room].persons[socket.id];
          //io.to(rooms.enquiry.id).emit('update-persons', rooms.enquiry.persons);
          _updateUserList(room);
          total--;
        });
      });
    }
  };
})();
