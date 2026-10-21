const auth = (req, res, next) => {
    const isAuthenticated = Boolean(req.session.user);
    const isLoginPage = req.path === '/login';

    if (!isAuthenticated && !isLoginPage) {
        return res.redirect('/user/login');
    }

    if (isAuthenticated && isLoginPage) {
        return res.redirect('/user/profile');
    }

    next();
};

module.exports = auth;
