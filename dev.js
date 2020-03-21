const static = require('node-static');
const http = require('http');

const port = process.env.PORT || 80;
const file = new(static.Server)(__dirname + '/public');

http.createServer(function (req, res) {
    req.addListener('end', function () {
        file.serve(req, res);
    }).resume();
}).listen(port);

console.log("server starting on " + port);