var _ = require('underscore');

var RESP_MESSAGE_KEY = 'response:message'

function info(){
  console.log.apply(console, arguments);
}

function debug(){
  if(false){
    console.log.apply(console, arguments);
  }
}

function SocketHelper(io, socket, validator) {
  this.io = io;
  this.socket = socket;
  this.validator = validator;
}

var p = SocketHelper.prototype;

p.setup = function () {
  var self = this;
  return this.validator.validate(this.socket).then(function(){
    self.joinRoom(self.socket.request.headers.referer);
    return true;
  });
};

p.processMessage = function (message) {
  try{
    //debug('データの受信');
    debug(message);

    //debug(this.hasJoined('http://localhost.l-engine.com:3333/'));

    if(message.key == 'shub.leave_all'){
      this.leaveAllRooms();
      return;
    }

    if(message.key == 'shub.leave'){
      this.leaveRoom(message.value.room);
      return;
    }

    if(message.key == 'shub.join'){
      this.joinRoom(message.value.room);
      return;
    }

    if(message.key == 'shub.move'){
      this.move(message.value.room);
      return;
    }


    if (message.options) {
      if (message.options.room === false) {
        //this.io.sockets.emit('response:message', message); //この実装では全ては許していない
        return;
      }

      if (_.isString(message.options.room)) {
        this.emit2room(message.options.room, RESP_MESSAGE_KEY, message);
        return;
      }

      if (message.options.room === true) {
        this.emit2rooms(RESP_MESSAGE_KEY, message);
      }
    } else {
      this.emit2rooms(RESP_MESSAGE_KEY, message);
    }
  }catch(ex){
    console.error(ex.stack);
  }

};

p.joinARoom = function(name){
  debug('joinARoom:', this.socket.id, name);
  debug('joinARoom:emit start');
  this.emit2room(name, 'shub.join', {
    id: this.socket.id,
    room: name
  });

  debug('joinARoom:join start');
  this.socket.join(name, function(err){
    if(err){
      debug('socket.join err:', err.message);
    }
    info('socket.join', name);
    debug('socket.join callbacked');
  });
  debug('joinARoom end');
};

p.joinRoom = function (name) {
  var self = this;
  debug('joinRoom:', this.socket.id, name);

  if(_.isString(name)){
    debug('joinRoom(str) start:', this.socket.id, name);
    this.joinARoom(name);
    debug('joinRoom(str) end:', this.socket.id, name);
    return;
  }

  if(_.isArray(name)){
    name.forEach(function(r){
      self.joinARoom(r);
    });
    debug('joinRoom(array) end:', this.socket.id, name);
    return;
  }

  throw new Error('UnexpectedName', name);
};

p.leaveRoom = function(room){
  debug('leaveRoom', this.socket.id, room);

  var self = this;
  self.socket.leave(room);

  this.emit2room(room, 'shub.leave', {
    id: this.socket.id,
    room: room
  });

};

p.leaveAllRooms = function(){
  debug('leaveAllRooms', this.socket.id);
  var self = this;
  this.socket.rooms.forEach(function(room){
    debug('room', room);
    if(self.socket.id === room) return;
    self.leaveRoom(room);
  });

//  var rooms = [];
//  this.socket.rooms.forEach(function(room){
//    debug('room', room);
//    if(self.socket.id === room) return;
//    rooms.push(room);
//  });
//
//  //this.socket.leaveAll();
//
//  rooms.forEach(function(room){
//    self.emit2room(room, 'shub.leave', {
//      id: self.socket.id,
//      room: room
//    });
//  });
};

p.move = function(room){
  debug('move', this.socket.id, room);
  this.leaveAllRooms();
  this.joinRoom(room);
};

p.hasJoined = function (name) {
  return this.socket.rooms.indexOf(name) != -1;
};

p.dispose = function () {
  debug('dispose', this.socket.id);
  this.emit2rooms("shub.disconnect", {
    id: this.socket.id
  });
  this.clean();
};

p.clean = function(){
  this.socket = null;
};

p.emit2rooms = function (key, message) {
  debug('emit2rooms', this.socket.id, key, message);
  var self = this;
  this.socket.rooms.forEach(function (name) {
    debug('name:', name);
    if (self.socket.id == name) return;
    self.io.sockets.to(name).emit(key, message);
  });
};

p.emit2room = function (room, key, message) {
  debug('emit2room', this.socket.id, room, key, message);
  this.io.sockets.to(room).emit(key, message);
};

exports.SocketHelper = SocketHelper;