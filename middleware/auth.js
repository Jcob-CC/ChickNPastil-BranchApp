const auth = (req, res, next) => {
    const isAuthenticationEndpoint = req.method === 'POST' & ['/user/check_pass', '/user/verify_email', '/user/start_session'].includes(req.path);
    const isPublicAsset = req.path.startsWith('/assets/') || req.path.startsWith('/js/');
    const isAuthenticated = Boolean(req.session.user);
    const isLoginPage = req.path === '/user/login';

    if (isAuthenticationEndpoint || isPublicAsset) {
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