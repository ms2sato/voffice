var express = require('express');

var app = express();
app.use(express.static(__dirname + '/public'));
var server = app.listen(80, '0.0.0.0', () => {
    // print a message when the server starts listening
    console.log("server starting on " + this);
});


var sio = require('socket.io'),
    SocketHelper = require('./app/models/socket_helper').SocketHelper,
    RefererSocketValidator = require('./app/models/referer_socket_validator').RefererSocketValidator,
    env = require('./env');


var io = sio(server);
var config = env[app.get('env')];
var validator = new RefererSocketValidator(config.referer);

io.sockets.on('connection', function (socket) {
    console.log('connection：' + socket.id);

    var s = new SocketHelper(io, socket, validator);
    s.setup().then(function () {

        socket.on('message', function (message) {
            s.processMessage(message);
        });

        socket.on("disconnect", function () {
            console.log('disconnect：' + socket.id);
            s.dispose();
            s = null;
        });

        socket.emit('connected', {status: 'OK'});

    }).catch(function (err) {
        console.error(err.stack);
        var req = socket.request;
        var ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
        console.error('IP:' + ip);
        s.clean();
        s = null;
    });

});
