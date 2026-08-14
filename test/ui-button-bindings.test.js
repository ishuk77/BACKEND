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

test('public dashboard initializes every visible action and form target', () => {
    const { elements } = loadPageScript('index.html', 'script.js');
    [
        'profileButton', 'btnCreateGroup', 'btnConnectGroup', 'btnLogout', 'btnChat',
        'btnPlatformConversation', 'btnMemberHistory', 'btnAddMember', 'btnManageCycle',
        'btnViewStats', 'btnMembers', 'btnRequestReview', 'setCycle', 'closeCycle', 'distributeCycle',
        'btnCollaboration', 'btnAudioCall', 'btnVideoCall', 'btnGroupVideo', 'emojiPickerButton'
    ].forEach(id => hasListener(elements, id, 'click'));
    [
        'loginForm', 'createGroupForm', 'profileForm', 'transactionForm',
        'addMemberForm', 'chatForm', 'platformConversationForm', 'meetingForm'
    ].forEach(id => hasListener(elements, id, 'submit'));
});

test('navigation groups actions without exposing platform administration publicly', () => {
    const publicLanding = fs.readFileSync(path.join(root, 'public', 'index.html'), 'utf8');
    const memberPortal = fs.readFileSync(path.join(root, 'public', 'platform.html'), 'utf8');
    const admin = fs.readFileSync(path.join(root, 'public', 'admin.html'), 'utf8');
    const adminScript = fs.readFileSync(path.join(root, 'public', 'admin.js'), 'utf8');

    assert.doesNotMatch(publicLanding, /href="admin\.html"/);
    assert.match(publicLanding, /<details class="action-menu" open>/);
    ['Finance', 'Groupe', 'Collaboration'].forEach(label => assert.match(publicLanding, new RegExp(`<summary>${label}`)));
    ['Profil et paramètres', 'Groupe', 'Collaboration', 'Social'].forEach(label => assert.match(memberPortal, new RegExp(`<summary>${label}`)));
    ['Finance', 'Groupe', 'Collaboration', 'Social', 'Profil et paramètres'].forEach(label => assert.match(admin, new RegExp(`<summary>${label}`)));
    assert.match(adminScript, /apiRequest\('\/api\/stats\/platform'\)/);
    assert.match(fs.readFileSync(path.join(root, 'public', 'sw.js'), 'utf8'), /avec-microcredit-cache-v34/);
});

test('legacy group login opens the canonical platform portal', async () => {
    const { elements, context, localStorage } = loadPageScript('index.html', 'script.js');
    const requests = [];
    elements.loginPhone.value = '+22992222223';
    elements.loginPin.value = '2468';
    let destination;
    context.window.location.assign = path => { destination = path; };
    context.fetch = async (url, options = {}) => {
        requests.push({ url, options });
        if (url.endsWith('/api/platform/auth/login')) {
            return {
                ok: true,
                json: async () => ({
                    accessToken: 'platform-access-token',
                    refreshToken: 'platform-refresh-token',
                    account: { id: 12, prenom: 'Membre', name: 'Test' }
                })
            };
        }
        throw new Error(`Unexpected request: ${url}`);
    };

    let prevented = false;
    await elements.loginForm.listeners.submit[0]({ preventDefault() { prevented = true; } });

    assert.equal(prevented, true);
    assert.equal(requests[0].url, 'http://localhost/api/platform/auth/login');
    assert.equal(requests[0].options.method, 'POST');
    assert.equal(requests[0].options.headers['Content-Type'], 'application/json');
    assert.equal(requests[0].options.body, JSON.stringify({ phone: '+22992222223', pin: '2468' }));
    assert.equal(localStorage.getItem('platformAccessToken'), 'platform-access-token');
    assert.equal(localStorage.getItem('platformRefreshToken'), 'platform-refresh-token');
    assert.equal(destination, 'platform.html');
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
        'btnManageMomo', 'btnPaymentLedger', 'btnSocialModeration', 'btnPlatformStats', 'btnAddMomo'
    ].forEach(id => hasListener(elements, id, 'click'));
    [
        'platformLoginForm', 'platformSetupForm', 'platformConversationForm'
    ].forEach(id => hasListener(elements, id, 'submit'));
    assert.equal(typeof context.showPaymentLedger, 'function');
    assert.equal(typeof context.platformLogout, 'function');
});

test('member platform binds country-aware group creation and all chat controls', () => {
    const { elements, context } = loadPageScript('platform.html', 'platform.js');
    ['groupCountry', 'dmAttachment', 'postImage'].forEach(id => hasListener(elements, id, 'change'));
    ['registerRequestCode', 'registerVerifyCode', 'profileRequestCode', 'profileVerifyCode'].forEach(id => hasListener(elements, id, 'click'));
    hasListener(elements, 'dmEmojiButton', 'click');
    hasListener(elements, 'dmMessages', 'click');
    [
        'registerForm', 'platformLoginForm', 'profileForm', 'securityProfileForm', 'avatarForm', 'createGroupForm',
        'searchForm', 'dmForm', 'postForm', 'eventForm'
    ].forEach(id => hasListener(elements, id, 'submit'));
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
                dashboard: { path: 'index.html', groupId: 42, memberId: 9 },
                group: { name: 'Groupe navigation' }
            })
        };
    };
    await elements.createGroupForm.listeners.submit[0]({ preventDefault() {} });
    assert.equal(localStorage.getItem('accessToken'), 'member-access-token');
    assert.equal(localStorage.getItem('refreshToken'), 'member-refresh-token');
    assert.equal(localStorage.getItem('groupId'), '42');
    assert.equal(localStorage.getItem('userId'), '9');
    assert.equal(destination, 'index.html');
});
