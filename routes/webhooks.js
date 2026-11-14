const express = require('express');
const posWebhook = require('../controllers/webhooks/pos');

const router = express.Router();

router.post('/pos/sold-menu-item', posWebhook.updateInventory);

module.exports = router;
