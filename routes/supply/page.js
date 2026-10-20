const express = require('express');
const path = require('path');

const router = express.Router();

router.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../app/pages/supply/inventory.html'));
}); 

router.get('/:filename', (req, res) => {
    res.sendFile(path.join(__dirname, '../app/pages/supply/' + req.params.filename + '.html'));
}); 

router.post('/inventory/:action', (req, res) => {
    
}); 

module.exports = router