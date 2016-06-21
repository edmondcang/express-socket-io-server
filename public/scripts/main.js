var chatWith = {};
var Storage = window.localStorage;

var Socket = (function ($) {
  var client;
  return {
    init: function () {
      client = io.connect('http://rt.glacemont.com:4100');
      client.on('connection', function (data) {
        console.log(data);
        View.render('login-form');
      });
      client.on('logged-in', function (data) {
        Storage.setItem('socket_id', data.socket_id);
        Storage.setItem('client_id', data.client_id);
        View.render('message-admin', data);
      });
      client.on('joined', function (data) {
        Storage.setItem('socket_id', data.socket_id);
        Storage.setItem('client_id', data.client_id);
        View.render('message', data);
      });
      client.on('update', function (data) {
        console.log(data);
      });
      client.on('update-persons', function (data) {
        console.log(data);
        if (Storage.getItem('type') == 'admin') {
          View.updateRoomList(data);
        }
      });
      client.on('message', function (data) {
        console.log(data);
        View.pushContent(`<p>${ data.from.name }: ${ data.content }</p>`);
      });
      client.on('invited', function (person) {
        chatWith.socket_id = person.socket_id;
      });
    },
    getClient: function () {
      return client;
    },
    disconnect: function () {
      client.disconnect();
    }
  };
})(jQuery);

var View = (function ($) {

  var $container = null;

  var
    $adminForm, $clientForm,
    $loginBtn, $joinRoom, $leaveRoom, $roomList,
    $adminName, $password, $userName, $email, $disp,
    $msgInput, $chatWithTitle
  ;

  var html = {
    'login-form': function () {
      return `
        <div id="client-form" class="mobile-form">
          <div>
            <input id="username" type="text" placeholder="Your Name" />
          </div>
          <div>
            <input id="email" type="text" placeholder="Email Address" />
          </div>
          <div>
            <button id="join-room" type="submit">Join</button>
          </div>
          <div>
            <button id="show-admin-form" type="submit">I am admin</button>
          </div>
        </div>
        <div id="admin-form" class="mobile-form">
          <div>
            <input id="admin-name" type="text" placeholder="Admin Name" />
          </div>
          <div>
            <input id="password" type="password" placeholder="Password" />
          </div>
          <div>
            <button id="login-btn" type="submit">Login</button>
          </div>
        </div>
      `
    },
    'message': function (data) {
      return `
        <div class="mobile-form">
          <div>
            ${data.client_id} | ${data.name} | ${data.email} | ${data.room}
            <button id="leave-room" class="btn btn-default">Leave</button>
          </div>
          <div>
            <div id="disp" class="disp"></div>
          </div>
          <div>
            <input id="msg-input" type="text" placeholder="Say something ...." />
          </div>
        </div>
      `
    },
    'message-admin': function (data) {
      return `
        <div class="mobile-form">
          <div>
            ${data.client_id} | ${data.name} | ${data.room}
            <button id="leave-room" class="btn btn-default">Leave</button>
          </div>
          <div>
            <h4>List of clients</h4>
            <div id="room-list" class="disp disp-short"></div>
          </div>
          <div>
            <h4 id="chat-with-title"></h4>
          </div>
          <div>
            <div id="disp" class="disp"></div>
          </div>
          <div>
            <input id="msg-input" class="" type="text" placeholder="Say something ...." />
          </div>
        </div>
      `
    }
  };

  var _afterRender = function (view) {

    console.log('after render');

    $adminForm = $('#admin-form');
    $showAdminForm = $('#show-admin-form');
    $clientForm = $('#client-form');

    $joinRoom = $('#join-room');
    $leaveRoom = $('#leave-room');
    $adminName = $('#admin-name');
    $password = $('#password');
    $userName = $('#username');
    $email = $('#email');
    $disp = $('#disp');
    $msgInput = $('#msg-input');

    $(window).off('keyup').on('keyup', function (e) {
      if (e.which == 13) {
        var msg = $.trim($msgInput.val());
        if (msg.length) {
          $msgInput.val('');
          console.log(chatWith);
          Socket.getClient().emit('send', { to: chatWith.socket_id, content: msg });
        }
      }
    });

    $leaveRoom.click(function (e) {
      console.log('leave-room');

      Storage.removeItem('id');
      Storage.removeItem('name');
      Storage.removeItem('type');
      Storage.removeItem('password');

      Socket.disconnect();
      View.render('login-form');
      Socket.init();
    });

    $joinRoom.click(function (e) {
      console.log('join-room');
      var name = $userName.val();
      var email = $email.val();
      console.log(name, email);
      var data = {};
      if ($.trim(name).length && $.trim(email).length) {
        data = { name: name, email: email };
      }
      else {
        Socket.getClient().emit('join', data);
      }
      console.log('emitted join');
      Storage.setItem('name', name);
      Storage.setItem('email', email);
      Storage.setItem('type', 'user');
    });

    switch (view) {

      case 'login-form':

        $loginBtn = $('#login-btn');

        $adminForm.hide();

        $showAdminForm.click(function (e) {
          $adminForm.show();
          $clientForm.hide();
        });

        $loginBtn.click(function (e) {
          var admin = $adminName.val();
          var password = $password.val();
          console.log(admin, password);
          if (!$.trim(admin).length || !$.trim(password).length) return;
          Socket.getClient().emit('login', { name: admin, password: password });
          Storage.setItem('name', admin);
          Storage.setItem('password', password);
          Storage.setItem('type', 'admin');
        });
        break;

      case 'message-admin':
        $roomList = $('#room-list');
        $chatWithTitle = $('#chat-with-title');

        $disp.hide();
        $chatWithTitle.hide();
        $msgInput.hide();
        break;
      
      default:
    }
  };

  return {
    init: function ($app) {
      $container = $app;
      return this;
    },
    pushContent: function (html) {
      $disp.append(html);
    },
    updateRoomList: function (data) {
      console.log('updateRoomList', data);
      var html = '';
      for (var socket_id in data) {
        if (socket_id == Storage.getItem('socket_id')) continue;
        html += `
          <div>
            <a href="#" class="chat-with" data-socket_id="${ socket_id }">${ data[socket_id].name + ( data[socket_id].type == 'user' ? ' (' + data[socket_id].email + ')' : '' ) }</a>
          </div>
        `;
      }
      $roomList.html(html);
      $('.chat-with').click(function (e) {
        chatWith.socket_id = $(this).data('socket_id');
        chatWith.title = $(this).html();
        $chatWithTitle.show().html(chatWith.title);
        $disp.show();
        $msgInput.show().focus();

        Socket.getClient().emit('invite', { to: chatWith.socket_id, from: Storage.getItem('socket_id') });
        Socket.getClient().emit('send', { to: chatWith.socket_id, content: '你好，我係 ' + Storage.getItem('name') + '。請問有咩可以幫到你' });
      });
      return this;
    },
    render: function (view, data) {
      console.log('will render ' + view);
      var htmlStr = html[view](data);
      $container.html(htmlStr);
      _afterRender(view);

      return this;
    }
  };
})(jQuery);

$(document).ready(function () {

  Socket.init();

  var $app = $('#app');
  View.init($app);

  if (Storage.getItem('client_id')) {
    if (Storage.getItem('type') == 'admin') {
      Socket.getClient().emit('login', { name: Storage.getItem('name'), password: Storage.getItem('password') });
    }
    else if (Storage.getItem('type') == 'user' && Storage.getItem('name')) {
      Socket.getClient().emit('join', { name: Storage.getItem('name'), email: Storage.getItem('email') });
    }
    else {
      Socket.getClient().emit('join', { id: Storage.getItem('client_id') });
    }
  }
});
