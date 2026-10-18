const express = require('express');
const path = require('path');

const router = express.Router();

router.get('/', (req, res) => {
    res.redirect('/supply/dashboard');
});

router.get('/:filename', (req, res) => {
    const filename = req.params.filename;
    res.sendFile(path.join(__dirname, '../client/pages/supply/' + filename + '.html'));
});

module.exports = router