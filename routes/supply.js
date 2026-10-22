const express = require('express');
const path = require('path');
const inventory = require('../controllers/supply/inventory');

const router = express.Router();

router.get('/inventory/data', inventory.getInventory);
router.post('/inventory/items', inventory.addInventoryItem);
router.put('/inventory/items/:id/settings', inventory.updateItemSettings);
router.put('/inventory/items/:id/stock', inventory.updateStock);

router.get('/:filename', (req, res) => {
    res.sendFile(path.join(__dirname, '../app/pages/supply', `${req.params.filename}.html`));
}); 

module.exports = router