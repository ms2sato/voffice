const express = require('express');

const app = express();
app.use(express.static(__dirname + '/public'));

const port = process.env.PORT || 80;
app.listen(port, '0.0.0.0', () => {
    console.log("server starting on " + port);
});