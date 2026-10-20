const port = 3000;

const express = require('express');
const path = require('path');

const app = express();

// fixes html src paths?
app.use(express.static(path.join(__dirname, 'app')));

app.use('/supply', require('./routes/supply/page'))

app.get('/', (req, res) => {
    res.redirect('/supply');
});

app.listen(port, () => {
    console.log('Server is running on localhost:' + port);
}); 