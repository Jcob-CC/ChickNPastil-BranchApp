const express = require('express');
const posWebhook = require('../controllers/webhooks/pos');
const gcash = require('../controllers/sales/gcash');

const router = express.Router();

router.post('/pos/sold-menu-item', posWebhook.updateInventory);
router.post('/gcash/sms', gcash.notify);

module.exports = router;
