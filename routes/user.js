const express = require('express');

const router = express.Router();

router.get('/:filename', (req, res) => {
    res.sendFile(path.join(__dirname, '../app/pages/user/' + req.params.filename + '.html'));
});

module.exports = router