const express = require('express');
const path = require('path');
const inventory = require('../controllers/supply/inventory');
const requestStock = require('../controllers/supply/request_stock');

const router = express.Router();

router.get('/inventory', (req, res) => {
    res.sendFile(path.join(__dirname, '../app/pages/supply/inventory.html'));
}); 
router.get('/request_stock', (req, res) => {
    res.sendFile(path.join(__dirname, '../app/pages/supply/request_stock.html'));
});

router.get('/inventory/data', inventory.getInventory);
router.post('/inventory/items', inventory.addInventoryItem);
router.put('/inventory/items/:id/settings', inventory.updateItemSettings);
router.put('/inventory/items/:id/stock', inventory.updateStock);

router.get('/request_stock/data', requestStock.getRequestData);
router.put('/request_stock/confirm-inventory', requestStock.confirmInventory);
router.post('/request_stock', requestStock.createRequest);

module.exports = router