var Person = function () {
};

module.exports = (function () {
  var maxConn = 10;
  var total = 0;
  var numAdmins = 0;
  var persons = {};
  var rooms = {
    enquiry: {
      id: 'enquiry',
      name: 'Enquiry Room',
      persons: {}
    }
  };
  var admins = {
    'Tuby Lam': 'sg12345678',
    'Joanne Wong': 'sg12345678',
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
            persons[socket.id] = person;

            socket.join(rooms.enquiry.id);
            rooms.enquiry.persons[socket.id] = person;

            io.to(rooms.enquiry.id).emit('update', person.name + ' joined');
            io.to(rooms.enquiry.id).emit('update-persons', rooms.enquiry.persons);

            socket.emit('joined', { id: socket.id, name: person.name, room: rooms.enquiry.id });
          }
        });

        socket.on('join', function (data) {

          var person = new Person();
          person.id = socket.id;
          person.name = data.name;
          person.email = data.email;
          persons[socket.id] = person;

          socket.join(rooms.enquiry.id);
          rooms.enquiry.persons[socket.id] = person;

          io.to(rooms.enquiry.id).emit('update', person.name + ' joined');
          io.to(rooms.enquiry.id).emit('update-persons', rooms.enquiry.persons);

          socket.emit('joined', { id: socket.id, name: person.name, email: person.email, room: rooms.enquiry.id });

        });

        socket.on('disconnect', function () {
          if (rooms.enquiry.persons[socket.id]) {
            io.to(rooms.enquiry.id).emit('update', rooms.enquiry.persons[socket.id].name + ' left');
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
