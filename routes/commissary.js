const express = require('express');
const path = require('path');
const commissary = require('../controllers/commissary');

const router = express.Router();

const requireCommissaryAccess = (req, res, next) => {
    const role = (req.session?.user?.role || '').toLowerCase();
    if (!['admin', 'manager', 'cook', 'supervisor'].includes(role)) return res.sendStatus(403);
    next();
};

const requireManager = (req, res, next) => {
    const role = (req.session?.user?.role || '').toLowerCase();
    if (role !== 'admin' && role !== 'manager') return res.sendStatus(403);
    next();
};

router.use(requireCommissaryAccess);

router.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../app/pages/commissary/index.html'));
});

router.get('/data', commissary.getData);
router.post('/items', requireManager, commissary.createStockItem);
router.put('/items/:id/adjust', commissary.adjustStock);
router.post('/items/:id/wastage', commissary.recordWastage);
router.post('/recipes', requireManager, commissary.createRecipe);
router.post('/batches', commissary.createBatch);
router.put('/batches/:id/start', commissary.startBatch);
router.put('/batches/:id/complete', commissary.completeBatch);
router.post('/purchase-orders', requireManager, commissary.createPurchaseOrder);
router.post('/purchase-orders/generate-low-stock', requireManager, commissary.generateLowStockPurchaseOrder);
router.put('/purchase-orders/:id/approve', requireManager, commissary.approvePurchaseOrder);
router.put('/purchase-orders/:id/receive', commissary.receivePurchaseOrder);
router.post('/deliveries', requireManager, commissary.createDelivery);
router.put('/deliveries/:id/dispatch', requireManager, commissary.dispatchDelivery);

module.exports = router;
