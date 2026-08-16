const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.join(__dirname, '..');

function element() {
    return {
        listeners: {},
        dataset: {},
        style: {},
        addEventListener(type, listener) {
            (this.listeners[type] ||= []).push(listener);
        },
        appendChild() {},
        replaceChildren() {},
        add() {},
        setAttribute() {}
    };
}

function loadPageScript(htmlFile, scriptFile) {
    const html = fs.readFileSync(path.join(root, 'public', htmlFile), 'utf8');
    const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
    const elements = Object.fromEntries(ids.map(id => [id, element()]));
    let domReady;
    const document = {
        addEventListener(type, listener) {
            if (type === 'DOMContentLoaded') domReady = listener;
        },
        getElementById(id) {
            if (!elements[id]) throw new Error(`Missing DOM target: ${id}`);
            return elements[id];
        },
        querySelectorAll() {
            return [];
        }
    };
    const storage = new Map();
    const localStorage = {
        getItem: key => storage.has(key) ? storage.get(key) : null,
        setItem(key, value) { storage.set(key, String(value)); },
        removeItem(key) { storage.delete(key); }
    };
    const context = {
        document,
        localStorage,
        Option: function Option(text, value) { this.text = text; this.value = value; },
        alert() {},
        confirm: () => false,
        fetch() { throw new Error('No network request is expected during page initialization'); },
        window: { location: { origin: 'http://localhost' }, MOMO_COUNTRIES: [], scrollTo() {} }
    };
    context.window.window = context.window;
    vm.runInNewContext(fs.readFileSync(path.join(root, 'public', scriptFile), 'utf8'), context, { filename: scriptFile });
    assert.ok(domReady, `${scriptFile} must register DOMContentLoaded`);
    domReady();
    return { elements, context, localStorage };
}

function hasListener(elements, id, type) {
    assert.ok(elements[id].listeners[type]?.length, `${id} needs a ${type} handler`);
}

test('public landing exposes no private dashboard controls', () => {
    const publicLanding = fs.readFileSync(path.join(root, 'public', 'index.html'), 'utf8');
    assert.doesNotMatch(publicLanding, /script\.js/);
    assert.doesNotMatch(publicLanding, /Profil et paramètres|Collaboration|adminDashboard|memberDashboard/);
    assert.match(publicLanding, /Créer mon compte membre/);
});
test('navigation groups actions without exposing platform administration publicly', () => {
    const publicLanding = fs.readFileSync(path.join(root, 'public', 'index.html'), 'utf8');
    const memberPortal = fs.readFileSync(path.join(root, 'public', 'platform.html'), 'utf8');
    const groupPortal = fs.readFileSync(path.join(root, 'public', 'group.html'), 'utf8');
    const groupScript = fs.readFileSync(path.join(root, 'public', 'group.js'), 'utf8');
    const admin = fs.readFileSync(path.join(root, 'public', 'admin.html'), 'utf8');
    const adminScript = fs.readFileSync(path.join(root, 'public', 'admin.js'), 'utf8');

    assert.doesNotMatch(publicLanding, /href="admin\.html"/);
    assert.doesNotMatch(publicLanding, /<details class="action-menu"/);
    ['Profil et paramètres', 'Groupe'].forEach(label => assert.match(memberPortal, new RegExp(`<summary>${label}`)));
    assert.match(memberPortal, /href="social\.html"/);
    assert.match(fs.readFileSync(path.join(root, 'public', 'social.html'), 'utf8'), /AVEC Communauté/);
    assert.match(memberPortal, /data-screen="walletScreen"/);
    assert.match(memberPortal, /Historique de mon compte plateforme/);
    assert.match(memberPortal, /id="platformAccountHistory"/);
    assert.match(memberPortal, /id="showCreateGroupForm"/);
    assert.match(memberPortal, /id="pickPhoneContacts"/);
    assert.match(memberPortal, /id="showPlatformContactSearch"/);
    assert.match(memberPortal, /<nav class="portal-mobile-subnav" aria-label="Sous-menu profil et portefeuille">/);
    assert.match(groupPortal, /id="memberDashboard"/);
    assert.match(groupPortal, /id="groupAdminDashboard"/);
    assert.match(groupPortal, /Mon wallet personnel AVEC/);
    assert.match(groupPortal, /Wallet AVEC —/);
    assert.match(groupPortal, /Paramètres et règles de gestion/);
    assert.match(groupPortal, /Demandes d’adhésion/);
    assert.match(groupPortal, /id="joinRequestsList"/);
    assert.match(groupScript, /Président\(s\) à contacter/);
    assert.match(memberPortal, /<section id="profileScreen"[\s\S]*?<h3>Accueil membre<\/h3>[\s\S]*?<\/section>/);
    assert.doesNotMatch(memberPortal.match(/<section id="profileScreen"[\s\S]*?<\/section>/)[0], /Mon wallet|Mon compte AVEC|Alimenter mon portefeuille/);
    ['Finance', 'Groupe', 'Collaboration', 'Social', 'Profil et paramètres'].forEach(label => assert.match(admin, new RegExp(`<summary>${label}`)));
    assert.match(adminScript, /apiRequest\('\/api\/stats\/platform'\)/);
    assert.match(memberPortal, /<section id="portalSection" class="card" hidden>/);
    assert.match(fs.readFileSync(path.join(root, 'public', 'style.css'), 'utf8'), /#portalSection\[hidden\][\s\S]*?display: none/);
    assert.match(fs.readFileSync(path.join(root, 'public', 'sw.js'), 'utf8'), /avec-microcredit-cache-v51/);
});

test('all application surfaces load the bundled locale controller and expose a shared selector', () => {
    const i18n = fs.readFileSync(path.join(root, 'public', 'i18n.js'), 'utf8');
    assert.match(i18n, /const STORAGE_KEY = 'avecLocale'/);
    ['fr', 'en', 'rw', 'rn', 'sw', 'ln'].forEach(locale => assert.match(i18n, new RegExp(`\\b${locale}: \\{`)));
    ['index.html', 'platform.html', 'social.html', 'news.html', 'group.html', 'admin.html'].forEach(file => {
        const page = fs.readFileSync(path.join(root, 'public', file), 'utf8');
        assert.match(page, /<script src="i18n\.js"><\/script>/);
        assert.match(page, /data-language-selector/);
    });
    assert.match(fs.readFileSync(path.join(root, 'public', 'sw.js'), 'utf8'), /'i18n\.js'/);
});

test('service worker refreshes the app shell from the network and falls back offline without caching API data', async () => {
    const handlers = {};
    const putCalls = [];
    const cachedResponse = { offline: true };
    let online = true;
    const self = {
        registration: { scope: 'http://localhost/' },
        location: { origin: 'http://localhost' },
        addEventListener(type, listener) { handlers[type] = listener; }
    };
    const caches = {
        open: async () => ({ put: async (request, response) => putCalls.push({ request, response }) }),
        match: async () => cachedResponse
    };
    const networkResponse = { ok: true, clone() { return { cached: true }; } };
    const context = {
        self,
        caches,
        URL,
        Set,
        fetch: async () => {
            if (!online) throw new Error('offline');
            return networkResponse;
        }
    };
    vm.runInNewContext(fs.readFileSync(path.join(root, 'public', 'sw.js'), 'utf8'), context, { filename: 'sw.js' });

    const waits = [];
    const onlineEvent = {
        request: { method: 'GET', mode: 'cors', url: 'http://localhost/script.js' },
        respondWith(promise) { this.response = promise; },
        waitUntil(promise) { waits.push(promise); }
    };
    handlers.fetch(onlineEvent);
    assert.equal(await onlineEvent.response, networkResponse);
    await Promise.all(waits);
    assert.equal(putCalls.length, 1);

    online = false;
    const offlineEvent = {
        request: { method: 'GET', mode: 'navigate', url: 'http://localhost/' },
        respondWith(promise) { this.response = promise; },
        waitUntil() {}
    };
    handlers.fetch(offlineEvent);
    assert.equal(await offlineEvent.response, cachedResponse);

    const apiEvent = {
        request: { method: 'GET', mode: 'cors', url: 'http://localhost/api/groups' },
        respondWith() { throw new Error('API requests must not be cached'); }
    };
    handlers.fetch(apiEvent);
});

test('platform dashboard initializes payment ledger and all administrator actions', () => {
    const { elements, context } = loadPageScript('admin.html', 'admin.js');
    [
        'btnShowPlatformSetup', 'btnBackToPlatformLogin', 'btnViewAllGroups',
        'btnViewAllMembers', 'btnViewAlerts', 'btnReviewRequests', 'btnPlatformMessages',
        'btnManageMomo', 'btnPaymentLedger', 'btnSocialModeration', 'btnPlatformStats', 'btnAddMomo',
        'publicContentLaunchPreset'
    ].forEach(id => hasListener(elements, id, 'click'));
    [
        'platformLoginForm', 'platformSetupForm', 'platformConversationForm'
    ].forEach(id => hasListener(elements, id, 'submit'));
    assert.equal(typeof context.showPaymentLedger, 'function');
    assert.equal(typeof context.platformLogout, 'function');
});

test('member platform binds country-aware group creation and all chat controls', () => {
    const { elements, context } = loadPageScript('platform.html', 'platform.js');
    loadPageScript('social.html', 'platform.js');
    ['groupCountry', 'dmAttachment', 'postImage'].forEach(id => hasListener(elements, id, 'change'));
    ['activationRequestCode', 'activationVerifyCode', 'pinResetRequestCode', 'pinResetVerifyCode', 'profileRequestCode', 'profileVerifyCode']
        .forEach(id => hasListener(elements, id, 'click'));
    hasListener(elements, 'dmEmojiButton', 'click');
    hasListener(elements, 'dmMessages', 'click');
    [
        'registerForm', 'platformLoginForm', 'pinResetForm', 'profileForm', 'profileAvatarForm', 'securityProfileForm', 'createGroupForm', 'contactPhoneForm',
        'searchForm', 'dmForm', 'postForm', 'eventForm'
    ].forEach(id => hasListener(elements, id, 'submit'));
    ['profileEmailRequestCode', 'profileEmailVerifyCode'].forEach(id => hasListener(elements, id, 'click'));
    assert.equal(typeof context.updateGroupMomoFields, 'function');
    assert.equal(typeof context.toggleDmReaction, 'function');
    assert.equal(typeof context.reactOrComment, 'function');
});

test('platform group creation stores the member session and opens the returned dashboard', async () => {
    const { elements, context, localStorage } = loadPageScript('platform.html', 'platform.js');
    context.Blob = Blob;
    context.ArrayBuffer = ArrayBuffer;
    elements.groupName.value = 'Groupe navigation';
    elements.groupCountry.value = 'Bénin';
    elements.groupProvince.value = 'Littoral';
    elements.groupCity.value = 'Cotonou';
    elements.groupProvider.value = 'MTN';
    elements.groupPhone.value = '90123456';
    let destination;
    context.window.location.assign = path => { destination = path; };
    context.fetch = async (url, options = {}) => {
        assert.equal(url, 'http://localhost/api/groups');
        assert.equal(options.method, 'POST');
        return {
            ok: true,
            json: async () => ({
                accessToken: 'member-access-token',
                refreshToken: 'member-refresh-token',
                dashboard: { path: 'group.html', groupId: 42, memberId: 9 },
                group: { name: 'Groupe navigation' }
            })
        };
    };
    await elements.createGroupForm.listeners.submit[0]({ preventDefault() {} });
    assert.equal(localStorage.getItem('accessToken'), 'member-access-token');
    assert.equal(localStorage.getItem('refreshToken'), 'member-refresh-token');
    assert.equal(localStorage.getItem('groupId'), '42');
    assert.equal(localStorage.getItem('userId'), '9');
    assert.equal(destination, 'group.html');
});
