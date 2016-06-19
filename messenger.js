var Person = function () {
};

module.exports = (function () {
  var maxConn = 10;
  var total = 0;
  var numAdmins = 0;
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
            var person = new Person();
            person.id = socket.id;
            person.name = data.name;
            person.type = 'admin';
            persons[socket.id] = person;

            socket.join(rooms.enquiry.id);
            rooms.enquiry.persons[socket.id] = person;

            socket.emit('logged-in', { id: socket.id, name: person.name, room: rooms.enquiry.id });

            io.to(rooms.enquiry.id).emit('update', person.name + ' joined');
            io.to(rooms.enquiry.id).emit('update-persons', rooms.enquiry.persons);
          }
        });

        socket.on('invite', function (data) {
          socket.broadcast.to(data.to).emit('invited', persons[data.from]);
        });

        socket.on('send', function (data) {
          console.log(data);
          socket.broadcast.to(data.to).emit('message', { from: persons[socket.id], content: data.content });
          socket.emit('message', { from: persons[socket.id], content: data.content });
        });

        socket.on('join', function (data) {

          if (names.indexOf(data.name) > -1) return;

          var person = new Person();
          person.id = socket.id;
          person.name = data.name;
          person.email = data.email;
          persons[socket.id] = person;

          socket.join(rooms.enquiry.id);
          rooms.enquiry.persons[socket.id] = person;

          names.push(data.name);
          socket.emit('joined', { id: socket.id, name: person.name, email: person.email, room: rooms.enquiry.id });

          io.to(rooms.enquiry.id).emit('update', person.name + ' joined');
          io.to(rooms.enquiry.id).emit('update-persons', rooms.enquiry.persons);

        });

        socket.on('disconnect', function () {
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
