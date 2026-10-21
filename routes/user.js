const express = require('express');
const path = require('path');
const login = require('../controllers/user/login');
const auth = require('../middleware/auth');

const router = express.Router();

router.get('/:filename', auth, (req, res) => {
    res.sendFile(path.join(__dirname, '../app/pages/user', `${req.params.filename}.html`));
});

router.post('/check_pass', login.checkPassword);
router.post('/verify_email', login.verifyEmail);
router.post('/start_session', login.startSession);

module.exports = router;