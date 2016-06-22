var Helper = require('./Helper');

var Person = function () {
};

module.exports = (function () {
  var maxConn = 10;
  var total = 0;
  var loggedInAdmins = [];
  var names = [];
  var persons = {};
  var rooms = {
    enquiry: {
      id: 'enquiry',
      name: 'Enquiry Room',
      persons: {}
    }
  };
  var admins = {
    'Tuby Lam': 'secret',
    'Joanne Wong': 'secret',
  };
  return {
    init: function (io) {

      io.on('connection', function (socket) {
        if (total == maxConn) {
          socket.disconnect();
        }
        else {
          socket.emit('connection', { event: 'connection', accepted: true });
          total++;
        }

        socket.on('login', function (data) {
          if (admins[data.name] && admins[data.name] == data.password) {

            if (loggedInAdmins.indexOf(data.name) > -1) {
              console.log(data.name + ' already logged in');
              console.log(loggedInAdmins);
              return;
            }

            loggedInAdmins.push(data.name);

            var person = new Person();
            person.client_id = Helper.keygen(32);
            person.socket_id = socket.id;
            person.name = data.name;
            person.type = 'admin';
            persons[socket.id] = person;

            socket.join(rooms.enquiry.id);
            rooms.enquiry.persons[socket.id] = person;

            socket.emit('logged-in', { client_id: person.client_id, socket_id: socket.id, name: person.name, room: rooms.enquiry.id });

            io.to(rooms.enquiry.id).emit('update', person.name + ' joined');
            io.to(rooms.enquiry.id).emit('update-persons', rooms.enquiry.persons);
          }
        });

        socket.on('invite', function (data) {
          socket.broadcast.to(data.to).emit('invited', persons[data.from]);
        });

        socket.on('send', function (data) {
          console.log(data);
          var d = new Date();
          socket.broadcast.to(data.to).emit('message', { from: persons[socket.id], content: data.content, time: d.getHours() + ':' + d.getMinutes() });
          socket.emit('message', { from: persons[socket.id], content: data.content, time: d.getHours() + ':' + d.getMinutes() });
        });

        socket.on('join', function (data) {

          // TODO: error handling
          if (names.indexOf(data.name) > -1) return;

          var person = new Person();

          // client_id provided, this guy had connection before
          if (data.client_id) {
            person.client_id = data.client_id;
          }
          // New client_id assigned to those who make first time connection
          else {
            person.client_id = Helper.keygen(32);
          }
          person.socket_id = socket.id;
          if (data.name && data.email) {
            names.push(data.name);
            person.name = data.name;
            person.email = data.email;
            person.type = 'user';
          }
          else {
            person.name = 'anonymous';
            person.email = '';
            person.type = 'anonymous';
          }
          persons[socket.id] = person;

          socket.join(rooms.enquiry.id);
          rooms.enquiry.persons[socket.id] = person;

          socket.emit('joined', { socket_id: person.socket_id, client_id: person.client_id, name: person.name, email: person.email, room: rooms.enquiry.id });

          io.to(rooms.enquiry.id).emit('update', person.name + ' joined');
          io.to(rooms.enquiry.id).emit('update-persons', rooms.enquiry.persons);

        });

        socket.on('disconnect', function () {
          if (persons[socket.id]) {
            if (persons[socket.id].type == 'admin') {
              loggedInAdmins.splice(loggedInAdmins.indexOf(persons[socket.id].name), 1);
            }
            console.log(persons[socket.id].name + ' disconnected');
          }
          if (rooms.enquiry.persons[socket.id]) {
            io.to(rooms.enquiry.id).emit('update', rooms.enquiry.persons[socket.id].name + ' left');
          }
          if (persons[socket.id])
            names.splice(names.indexOf(persons[socket.id].name), 1);
          delete persons[socket.id];
          delete rooms.enquiry.persons[socket.id];
          io.to(rooms.enquiry.id).emit('update-persons', rooms.enquiry.persons);
          total--;
        });
      });
    }
  };
})();
