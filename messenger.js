var Person = function () {
};

module.exports = (function () {
  var persons = {};
  var rooms = {
    enquiry: {
      id: 'enquiry',
      name: 'Enquiry Room',
      persons: {}
    }
  };
  return {
    init: function (io) {

      io.on('connection', function (socket) {
        socket.emit('connection', { event: 'connection', accepted: true });
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

        });

        socket.on('disconnect', function () {
          io.to(rooms.enquiry.id).emit('update', persons[socket.id].name + ' left');
          delete persons[socket.id];
          delete rooms.enquiry.persons[socket.id];
          io.to(rooms.enquiry.id).emit('update-persons', rooms.enquiry.persons);
        });
      });
    }
  };
})();
