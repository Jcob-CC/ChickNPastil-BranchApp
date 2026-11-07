const auth = (req, res, next) => {
    const isAuthenticationEndpoint = req.method === 'POST' && [
        '/user/check_pass',
        '/user/apply',
        '/user/verify_email',
        '/user/start_session',
        '/user/password-reset/request',
        '/user/password-reset/verify',
        '/user/password-reset/complete',
    ].includes(req.path);
    const isPosInventoryWebhook = req.method === 'POST' && req.path === '/webhooks/pos/inventory';
    const isPublicAsset = req.path.startsWith('/assets/') || req.path.startsWith('/js/');
    const isAuthenticated = Boolean(req.session.user);
    const isLoginPage = req.path === '/user/login';

    if (isAuthenticationEndpoint || isPosInventoryWebhook || isPublicAsset) {
        return next();
    }   
    else if (!isAuthenticated && !isLoginPage) {
        return res.redirect('/user/login');
    }
    else if (isAuthenticated && isLoginPage) {
        return res.redirect('/user/profile');
    }

    next();
};

module.exports = auth;