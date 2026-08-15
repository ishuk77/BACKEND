document.addEventListener('DOMContentLoaded', () => {
    ['profileScreen', 'walletScreen', 'groupsScreen'].forEach(id => {
        const element = document.getElementById(id);
        if (element) element.hidden = true;
    });
    document.querySelectorAll('.portal-nav, .portal-mobile-nav, .portal-mobile-subnav').forEach(element => { element.hidden = true; });
});
