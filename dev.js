var express = require('express');

var app = express();
app.use(express.static(__dirname + '/public'));
var server = app.listen(80, '0.0.0.0', () => {
    console.log("server starting on " + this);
});