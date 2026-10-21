const express = require('express');
const path = require('path');

const router = express.Router();

router.get('/:filename', (req, res) => {
    res.sendFile(path.join(__dirname, '../app/pages/supply', `${req.params.filename}.html`));
}); 

module.exports = router