SHUB = {};
var scripts = document.getElementsByTagName("script");
SHUB.myself = scripts[scripts.length - 1].src;

(function (exports) {

  var Observer = (function () {

    function Observer() {
      this.events = {}
    }

    var p = Observer.prototype;
    p.on = function (event, func) {
      var self = this;
      var trigger = {
        on: function () {
          self._on(event, func);
        },
        off: function () {
          self._off(event, func);
        }
      };
      trigger.on();
      return trigger;
    };

    p._on = function (event, func) {
      var e = this.events[event];
      if (!e) {
        this.events[event] = e = [];
      }
      e.push(func);
    };

    p._off = function (event, func) {
      var e = this.events[event];
      if (!e) return;

      for (var i = 0; i < e.length; ++i) {
        var ev = e[i];
        if (ev === func) {
          e.splice(i, 1);
          break;
        }
      }

      if (e.length == 0) {
        delete this.events[event];
      }
    };

    p.trigger = function () {
      var event = Array.prototype.shift.call(arguments);
      var funcs = this.events[event];
      if (!funcs) return;
      for (var i = 0; i < funcs.length; ++i) {
        var func = funcs[i];
        func.apply(this, arguments);
      }
    };

    p.hasEvent = function (event) {
      return !!this.events[event];
    };

    return Observer;
  })();


  var SocketHub = (function () {

    function SocketHub(socket) {
      var self = this;
      this.o = new Observer();
      this.socket = socket;
      this.is_connect_message = false;

      var key = 'response:message';
      this.socket.on(key, function (bucket) {
        self.o.trigger.call(self.o, bucket.key, bucket.value);
      });
    }

    var p = SocketHub.prototype;
    p.emit = function (key, value, options) {
      var self = this;
      if(self.is_connect_message &&
        (key === 'shub.move' || key === 'shub.join' || key === 'shub.leave' || key === 'shub.leave_all')
      ){
        throw new Error('Cannot call ' + key + ' on connect message handler');
      }

      var bucket = {
        key: key,
        value: value,
        options: options
      };

      console.log('socket.emit start', key, value, options);
      this.socket.emit('message', bucket);
      console.log('socket.emit end', key, value, options);
    };

    p.on = function () {

      var self = this;
      var key = arguments[0];

      if (!this.o.hasEvent(key)) {
        this.socket.on(key, function (bucket) {
          try{
            if(key === 'connect'){
              self.is_connect_message = true;
            }

            console.log('socket.on start:', key, bucket);
            self.o.trigger.call(self.o, key, arguments[0]);
            console.log('socket.on end:', key, bucket);

            if(key === 'connect'){
              self.is_connect_message = false;
            }
          } catch (ex){
            self.o.trigger('error', ex);
          }

        });
      }

      return self.o.on.apply(self.o, arguments);
    };


    p.leave_all = function () {
      this.emit('shub.leave_all');
    };

    p.leave = function (room) {
      this.emit('shub.leave', {room: room});
    };

    p.join = function (room) {
      this.emit('shub.join', {room: room});
    };

    p.move = function (room) {
      this.emit('shub.move', {room: room});
    };

    return SocketHub;
  })();


  function promise(shub, key) {
    return $.Deferred(function (d) {
      var st = shub.on(key, function (ret) {
        d.resolve(ret);
        et.off();
        et = null;
        st.off();
        st = null;
      });

      var et = shub.on('error', function (ret) {
        d.reject(ret);
        et.off();
        et = null;
        st.off();
        st = null;
      });
      return d;
    });
  }

  // @see http://hodade.adam.ne.jp/seiki/page.php?r_url_bunkai
  // @see http://jsdo.it/ms2sato/tt0a
  function parse_uri(uri) {
    var reg = /^(.+?):\/\/(.+?):?(\d+)?(\/.*)?$/;
    var m = uri.match(reg);
    if (m) {
      return {"scheme":m[1], "host":m[2], "port": m[3], "path":m[4], "query":m[5], "fragment":m[6]};
    } else {
      return null;
    }
  }

  function get_server_path(){
    var parts = parse_uri(exports.myself);
    var path = parts.scheme + '://' + parts.host + ':' + ((parts.port)? parts.port : '80')
    return path;
  }


  exports.create = function (url) {
    var socket = io.connect(url || get_server_path());
    return new SocketHub(socket);
  };

  exports.promise = promise;


})(SHUB);

