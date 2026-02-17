(function () {
    // SECURITY CHECK: Redirect to gatekeeper if not authorized
    if (localStorage.getItem('forFun_auth') !== 'true') {
        const root = window.location.pathname.includes('/forFun/')
            ? window.location.pathname.split('/forFun/')[0] + '/forFun/index.html'
            : '/docs/forFun/index.html';

        // Block interaction immediately
        document.documentElement.style.display = 'none';
        window.location.href = root;
    }
})();
