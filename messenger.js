var Helper = require('./Helper');

var Person = function () {
};

module.exports = (function () {
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

  for (var i = maxConn; i >= 1; i--) {
    numAvailable.push(i);
  }

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
          //if (admins[data.name] && admins[data.name] == data.password) {
          if (data.name) {

            if (loggedInUsers.indexOf(data.name) > -1) {
              console.log(data.name + ' already logged in');
              console.log(loggedInUsers);
              return;
            }

            loggedInUsers.push(data.name);

            var person = new Person();
            person.client_id = Helper.keygen(32);
            person.socket_id = socket.id;
            person.name = data.name;
            person.type = 'admin';
            persons[socket.id] = person;

            socket.join(rooms.enquiry.id);
            rooms.enquiry.persons[socket.id] = person;

            socket.emit('logged-in', person);
            //socket.emit('logged-in', { client_id: person.client_id, socket_id: socket.id, name: person.name, room: rooms.enquiry.id });

            var d = new Date();
            io.to(rooms.enquiry.id).emit('update', { msg: person.name + ' 加入', time: d.getHours() + ':' + d.getMinutes() });
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
          var newClient = false;

          // TODO: error handling
          if (names.indexOf(data.name) > -1) return;

          var person = new Person();

          // client_id provided, this guy had connection before
          if (data.client_id) {
            person.client_id = data.client_id;
          }
          // New client_id assigned to those who make first time connection
          else {
            newClient = true;
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
            var num = numAvailable.pop();
            numAssigned[socket.id] = num;
            person.name = '訪客' + num;
            person.email = '';
            person.type = 'anonymous';
            person.assignation = num;
            console.log(numAvailable, numAssigned);
          }
          persons[socket.id] = person;

          socket.join(rooms.enquiry.id);
          rooms.enquiry.persons[socket.id] = person;

          socket.emit('joined', { socket_id: person.socket_id, client_id: person.client_id, name: person.name, email: person.email, room: rooms.enquiry.id });

          io.to(rooms.enquiry.id).emit('update', person.name + ' joined');
          io.to(rooms.enquiry.id).emit('update-persons', rooms.enquiry.persons);

          if (newClient && person.type != 'admin') {
            var d = new Date();
            socket.emit('message', { from: { name: 'ShoppingGAI' }, content: '請問有甚麼問題需要幫忙嗎？', time: d.getHours() + ':' + d.getMinutes() });
          }
        });

        socket.on('disconnect', function () {
          console.log(numAvailable);
          if (persons[socket.id]) {
            if (persons[socket.id].type == 'admin') {
              loggedInUsers.splice(loggedInUsers.indexOf(persons[socket.id].name), 1);
            }
            else if (persons[socket.id].type == 'anonymous') {
              if (numAnonymous > 0)
                numAnonymous--;
              numAvailable.push(numAssigned[socket.id]);
              delete numAssigned[socket.id];
              console.log(numAvailable, numAssigned);
            }
            console.log(persons[socket.id].name + ' disconnected');
            names.splice(names.indexOf(persons[socket.id].name), 1);
          }
          if (rooms.enquiry.persons[socket.id]) {
            var d = new Date();
            io.to(rooms.enquiry.id).emit('update', { msg: rooms.enquiry.persons[socket.id].name + ' 離開', time: d.getHours() + ':' + d.getMinutes() });
          }
          delete persons[socket.id];
          delete rooms.enquiry.persons[socket.id];
          io.to(rooms.enquiry.id).emit('update-persons', rooms.enquiry.persons);
          total--;
        });
      });
    }
  };
})();
