const api = window.location.origin;
const $p = id => document.getElementById(id);
const DM_REACTIONS = ['👍', '❤️', '😂', '😮', '🙏', '🎉'];
let account = null;
let friends = [];
let selectedDm = null;
let selectedDmAttachment = null;
let paidContentPrices = null;
let pendingMomoPaymentId = null;
let pendingWalletTopupId = null;
const mediaUrls = new Map();
const PHONE_VERIFICATION_SESSION_KEY = 'platformPhoneVerificationSession';
const phoneVerificationTokens = { register: null, profile: null, reset: null };
const UI_TRANSLATIONS = Object.freeze({
    fr: { nav_profile: 'Profil et paramètres', nav_groups: 'Groupe', nav_messages: 'Collaboration', nav_social: 'Social', profile: 'Mon profil', groups: 'Mes groupes', messages: 'Messages', discover: 'Découvrir des membres', feed: 'Fil social', publish: 'Publier', calendar: 'Agenda' },
    en: { nav_profile: 'Profile and settings', nav_groups: 'Groups', nav_messages: 'Messages', nav_social: 'Social', profile: 'My profile', groups: 'My groups', messages: 'Messages', discover: 'Discover members', feed: 'Social feed', publish: 'Publish', calendar: 'Calendar' },
    rw: { nav_profile: 'Umwirondoro n’igenamiterere', nav_groups: 'Amatsinda', nav_messages: 'Ubutumwa', nav_social: 'Imbuga nkoranyambaga', profile: 'Umwirondoro wanjye', groups: 'Amatsinda yanjye', messages: 'Ubutumwa', discover: 'Shakisha abanyamuryango', feed: 'Kwamamaza', publish: 'Kwamamaza', calendar: 'Kalendari' },
    rn: { nav_profile: 'Umwirondoro n’ugutunganya', nav_groups: 'Imigwi', nav_messages: 'Ubutumwa', nav_social: 'Kwamamaza', profile: 'Umwirondoro wanje', groups: 'Imigwi yanje', messages: 'Ubutumwa', discover: 'Rondera abanywanyi', feed: 'Kwamamaza', publish: 'Kwamamaza', calendar: 'Kalendari' },
    sw: { nav_profile: 'Wasifu na mipangilio', nav_groups: 'Vikundi', nav_messages: 'Ujumbe', nav_social: 'Jamii', profile: 'Wasifu wangu', groups: 'Vikundi vyangu', messages: 'Ujumbe', discover: 'Tafuta wanachama', feed: 'Mlisho wa jamii', publish: 'Chapisha', calendar: 'Kalenda' }
});
const COUNTRY_LOCALES = Object.freeze({ Rwanda: 'rw', Burundi: 'rn', Tanzanie: 'sw', Kenya: 'sw', 'Afrique du Sud': 'en', Ghana: 'en', Nigeria: 'en', Liberia: 'en', 'Sierra Leone': 'en' });
let languageOverridden = localStorage.getItem('platformUiLanguageOverride') === 'true';

const esc = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[character]));
const countryByName = name => (window.MOMO_COUNTRIES || []).find(country => country.name === name);
const MEMBER_COUNTRIES = () => [...(window.MOMO_COUNTRIES || []), { name: 'Haïti', dialCode: '+509' }]
    .sort((first, second) => first.name.localeCompare(second.name, 'fr'));
function tokenHeaders(extra = {}) {
    const token = localStorage.getItem('platformAccessToken');
    return { ...extra, ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}
function idempotencyKey(prefix) {
    return `${prefix}-${window.crypto && window.crypto.randomUUID ? window.crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`}`;
}
async function request(path, options = {}, retry = true) {
    const raw = options.body instanceof Blob || options.body instanceof ArrayBuffer;
    const headers = tokenHeaders({ ...(raw ? {} : { 'Content-Type': 'application/json' }), ...(options.headers || {}) });
    let response = await fetch(api + path, { ...options, headers });
    if (retry && response.status === 403 && localStorage.getItem('platformRefreshToken')) {
        const refresh = await fetch(api + '/api/platform/auth/refresh', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ refreshToken: localStorage.getItem('platformRefreshToken') })
        });
        if (refresh.ok) {
            const data = await refresh.json();
            localStorage.setItem('platformAccessToken', data.accessToken);
            localStorage.setItem('platformRefreshToken', data.refreshToken);
            return request(path, options, false);
        }
    }
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Une erreur est survenue');
    return data;
}
function notice(message) {
    $p('portalNotice').textContent = message;
    $p('portalNotice').style.display = 'block';
}
function money(minor) { return `${(minor / 100).toFixed(2).replace('.', ',')} USD-équivalent SANDBOX`; }
function imageUrl(id) { return id ? `/api/media/${encodeURIComponent(id)}` : ''; }
function initials(person = account) { return `${person?.prenom || ''}${person?.name || ''}`.trim().slice(0, 2).toUpperCase() || 'AV'; }
function avatarMarkup(person, className = 'chat-avatar') {
    const avatar = person?.avatar_media_id;
    return avatar
        ? `<img class="${className} protected-avatar" src="icon.svg" data-media-id="${Number(avatar)}" alt="Photo de ${esc(`${person.prenom} ${person.name}`)}">`
        : `<span class="${className}" aria-hidden="true">${esc(initials(person))}</span>`;
}
async function protectedMediaUrl(mediaId) {
    if (mediaUrls.has(mediaId)) return mediaUrls.get(mediaId);
    const response = await fetch(`${api}${imageUrl(mediaId)}`, { headers: tokenHeaders() });
    if (!response.ok) throw new Error('Image indisponible');
    const url = URL.createObjectURL(await response.blob());
    mediaUrls.set(mediaId, url);
    return url;
}
function hydrateProtectedMedia(root = document) {
    root.querySelectorAll('.protected-avatar, .protected-media').forEach(element => {
        protectedMediaUrl(element.dataset.mediaId).then(url => { element.src = url; }).catch(() => { element.hidden = true; });
    });
}
function applyUiLanguage(locale) {
    const dictionary = UI_TRANSLATIONS[locale] || UI_TRANSLATIONS.fr;
    if (document.documentElement) document.documentElement.lang = locale;
    document.querySelectorAll('[data-i18n]').forEach(element => { element.textContent = dictionary[element.dataset.i18n] || element.textContent; });
    document.querySelectorAll('[data-i18n-label]').forEach(element => {
        const value = dictionary[element.dataset.i18nLabel];
        if (!value) return;
        element.setAttribute('aria-label', value);
        element.setAttribute('title', value);
        const text = element.querySelector('.sr-only');
        if (text) text.textContent = value;
    });
    $p('uiLanguage').value = locale;
    localStorage.setItem('platformUiLanguage', locale);
}

function chooseCountryLanguage(country) {
    if (!languageOverridden) applyUiLanguage(COUNTRY_LOCALES[country] || 'fr');
}

function show(screen, { history = true } = {}) {
    if (!document.getElementById(screen)) return;
    document.querySelectorAll('.portal-screen').forEach(element => { element.hidden = element.id !== screen; });
    if (history && window.history) window.history.pushState({ platformScreen: screen }, '', `#${encodeURIComponent(screen)}`);
    const heading = document.querySelector(`#${screen} h2, #${screen} h3`);
    if (heading) {
        heading.tabIndex = -1;
        heading.focus({ preventScroll: true });
    }
    if (screen === 'groupsScreen') loadGroups().catch(error => alert(error.message));
    if (screen === 'friendsScreen') loadFriends().catch(error => alert(error.message));
    if (screen === 'feedScreen') loadFeed().catch(error => alert(error.message));
    if (screen === 'contentScreen') loadPaidContentPrices().catch(error => notice(error.message));
    if (screen === 'calendarScreen') loadEvents().catch(error => alert(error.message));
}
function browserVerificationSessionId() {
    const storage = window.sessionStorage;
    let id = storage.getItem(PHONE_VERIFICATION_SESSION_KEY);
    if (!id) {
        id = window.crypto?.randomUUID ? window.crypto.randomUUID().replace(/-/g, '') : `${Date.now()}${Math.random().toString(36).slice(2)}`;
        storage.setItem(PHONE_VERIFICATION_SESSION_KEY, id);
    }
    return id;
}
function showVerificationStatus(statusId, message) {
    $p(statusId).textContent = message;
}
async function requestPhoneVerification(flow, phoneId, statusId) {
    const phone = phoneId === 'registerPhone' ? normalizeRegisterPhone() : $p(phoneId).value.trim();
    if (phoneId === 'registerPhone') $p(phoneId).value = phone;
    const data = await request('/api/platform/phone-verifications/request', {
        method: 'POST',
        body: JSON.stringify({ phone, browserSessionId: browserVerificationSessionId() })
    });
    phoneVerificationTokens[flow] = null;
    const codeFieldByFlow = { register: 'registerVerificationCode', profile: 'profileVerificationCode', reset: 'pinResetCode' };
    const codeField = $p(codeFieldByFlow[flow]);
    if (data.sandbox && codeField) codeField.value = data.sandboxCode;
    showVerificationStatus(statusId, data.sandbox
        ? `Code SANDBOX ajouté au champ ci-dessous : ${data.sandboxCode}. Il expire le ${new Date(data.expiresAt).toLocaleTimeString('fr-FR')}.`
        : `Code envoyé par SMS. Il expire le ${new Date(data.expiresAt).toLocaleTimeString('fr-FR')}.`);
}
async function verifyPhoneVerification(flow, phoneId, codeId, statusId) {
    const phone = phoneId === 'registerPhone' ? normalizeRegisterPhone() : $p(phoneId).value.trim();
    if (phoneId === 'registerPhone') $p(phoneId).value = phone;
    const data = await request('/api/platform/phone-verifications/verify', {
        method: 'POST',
        body: JSON.stringify({
            phone,
            code: $p(codeId).value.trim(),
            browserSessionId: browserVerificationSessionId()
        })
    });
    phoneVerificationTokens[flow] = data.verificationToken;
    showVerificationStatus(statusId, 'Téléphone vérifié dans cette session.');
}
function renderAccount() {
    $p('portalName').textContent = `${account.prenom} ${account.name}`;
    $p('portalIdentifier').textContent = account.identifier;
    $p('profileInitials').textContent = initials();
    $p('avatarPreview').hidden = !account.avatar_media_id;
    if (account.avatar_media_id) {
        $p('avatarPreview').dataset.mediaId = account.avatar_media_id;
        $p('avatarPreview').classList.add('protected-avatar');
        hydrateProtectedMedia($p('profileScreen'));
    }
    $p('profileFirstName').value = account.prenom;
    $p('profileLastName').value = account.name;
    $p('profileAvailability').value = account.availability;
    $p('profileVisibility').value = account.visibility;
    $p('internalWallet').textContent = Number(account.internal_wallet || 0);
    $p('momoWallet').textContent = Number(account.momo_wallet || 0);
    const securityForm = $p('securityProfileForm');
    securityForm.hidden = Boolean(account.onboardingComplete);
    if (!securityForm.hidden) {
        $p('profileSecurityPhone').value = account.phone || '';
        $p('profileIdentityNumber').required = !account.identityVerified;
        $p('profileSecurityPin').required = !account.pinConfigured;
        $p('profileSecurityPinConfirmation').required = !account.pinConfigured;
        $p('profileVerificationCode').required = !account.phoneVerified;
    }
}
async function loadProfile() { account = (await request('/api/platform/profile')).account; renderAccount(); }
async function loadWalletTopups() {
    const data = await request('/api/wallet/topups');
    const history = $p('walletTopupHistory');
    history.replaceChildren();
    data.topups.forEach(topup => {
        const item = document.createElement('p');
        item.className = 'field-hint';
        item.textContent = `${topup.provider === 'momo_sandbox' ? 'Momo' : 'Visa / Mastercard'} · ${(topup.amount_minor / 100).toFixed(2)} USD · ${topup.status}`;
        history.appendChild(item);
    });
}
async function createWalletTopup(event) {
    event.preventDefault();
    const data = await request('/api/wallet/topups', {
        method: 'POST',
        headers: { 'Idempotency-Key': idempotencyKey('wallet-topup') },
        body: JSON.stringify({ amount: $p('walletTopupAmount').value, provider: $p('walletTopupProvider').value })
    });
    pendingWalletTopupId = data.topup.payment_id;
    $p('walletTopupStatus').textContent = 'Rechargement créé. Confirmez-le en SANDBOX pour créditer votre portefeuille.';
    $p('simulateWalletTopup').hidden = false;
    await loadWalletTopups();
}
async function confirmWalletTopup() {
    if (!pendingWalletTopupId) throw new Error('Créez d’abord un rechargement.');
    const data = await request(`/api/wallet/topups/${encodeURIComponent(pendingWalletTopupId)}/simulate-confirmation`, { method: 'POST', body: '{}' });
    account = data.account;
    renderAccount();
    pendingWalletTopupId = null;
    $p('simulateWalletTopup').hidden = true;
    $p('walletTopupStatus').textContent = 'Portefeuille crédité en SANDBOX.';
    await loadWalletTopups();
}
async function enter() {
    await loadProfile();
    await loadWalletTopups();
    $p('authSection').hidden = true;
    $p('portalSection').hidden = false;
    // Every member, including a migrated legacy member, lands in the same
    // portal and explicitly selects the AVEC dashboard to open.
    show('groupsScreen', { history: false });
}
async function register(event) {
    event.preventDefault();
    if (!phoneVerificationTokens.register) throw new Error('Vérifiez le téléphone SANDBOX avant de créer le compte.');
    const data = await request('/api/platform/auth/register', { method: 'POST', body: JSON.stringify({
        prenom: $p('registerFirstName').value.trim(), name: $p('registerName').value.trim(),
        identityNumber: $p('registerIdentityNumber').value.trim(),
        country: $p('registerCountry').value, phone: normalizeRegisterPhone(), pin: $p('registerPin').value.trim(),
        pinConfirmation: $p('registerPinConfirmation').value.trim(),
        phoneVerificationToken: phoneVerificationTokens.register,
        browserSessionId: browserVerificationSessionId()
    }) });
    localStorage.setItem('platformAccessToken', data.accessToken);
    localStorage.setItem('platformRefreshToken', data.refreshToken);
    await enter();
    notice('Compte plateforme créé. Vous pouvez maintenant créer ou demander à rejoindre un groupe.');
}
async function login(event) {
    event.preventDefault();
    const data = await request('/api/platform/auth/login', { method: 'POST', body: JSON.stringify({
        phone: $p('platformPhone').value.trim(), pin: $p('platformPin').value.trim()
    }) });
    localStorage.setItem('platformAccessToken', data.accessToken);
    localStorage.setItem('platformRefreshToken', data.refreshToken);
    await enter();
}
async function resetPin(event) {
    event.preventDefault();
    if (!phoneVerificationTokens.reset) throw new Error('Vérifiez le téléphone avant de réinitialiser le PIN.');
    const data = await request('/api/auth/pin-reset', {
        method: 'POST',
        body: JSON.stringify({
            phone: $p('pinResetPhone').value.trim(),
            pin: $p('pinResetNewPin').value.trim(),
            pinConfirmation: $p('pinResetPinConfirmation').value.trim(),
            phoneVerificationToken: phoneVerificationTokens.reset,
            browserSessionId: browserVerificationSessionId()
        })
    });
    phoneVerificationTokens.reset = null;
    $p('pinResetForm').reset();
    showVerificationStatus('pinResetStatus', data.message);
}
async function saveProfile(event) {
    event.preventDefault();
    account = (await request('/api/platform/profile', { method: 'PUT', body: JSON.stringify({
        prenom: $p('profileFirstName').value.trim(), name: $p('profileLastName').value.trim(),
        availability: $p('profileAvailability').value, visibility: $p('profileVisibility').value
    }) })).account;
    renderAccount();
    notice('Profil mis à jour.');
}
async function saveSecurityProfile(event) {
    event.preventDefault();
    if (!account.onboardingComplete && !phoneVerificationTokens.profile && !account.phoneVerified) {
        throw new Error('Vérifiez le téléphone SANDBOX avant d’enregistrer.');
    }
    account = (await request('/api/platform/profile/security', {
        method: 'PUT',
        body: JSON.stringify({
            identityNumber: $p('profileIdentityNumber').value.trim(),
            pin: $p('profileSecurityPin').value.trim(),
            pinConfirmation: $p('profileSecurityPinConfirmation').value.trim(),
            phoneVerificationToken: phoneVerificationTokens.profile,
            browserSessionId: browserVerificationSessionId()
        })
    })).account;
    phoneVerificationTokens.profile = null;
    renderAccount();
    notice('Éléments de sécurité enregistrés.');
}
async function uploadAvatar(event) {
    event.preventDefault();
    const file = $p('avatarFile').files[0];
    if (!file) throw new Error('Choisissez une image');
    const data = await request('/api/profile/avatar', { method: 'POST', headers: { 'Content-Type': file.type, 'X-File-Name': file.name }, body: file });
    account.avatar_media_id = data.media.id;
    renderAccount();
    notice('Photo enregistrée.');
}
function populateGroupCountries() {
    const select = $p('groupCountry');
    select.replaceChildren(new Option('Sélectionner un pays', ''));
    (window.MOMO_COUNTRIES || []).forEach(country => select.add(new Option(country.name, country.name)));
    updateGroupMomoFields();
}
function populateRegisterCountries() {
    const select = $p('registerCountry');
    select.replaceChildren(new Option('Sélectionner un pays', ''));
    MEMBER_COUNTRIES().forEach(country => select.add(new Option(`${country.name} (${country.dialCode})`, country.name)));
    updateRegisterDialCode();
}
function updateRegisterDialCode() {
    const country = MEMBER_COUNTRIES().find(item => item.name === $p('registerCountry').value);
    $p('registerDialCode').textContent = country ? country.dialCode : '+--';
}
function normalizeRegisterPhone() {
    const country = MEMBER_COUNTRIES().find(item => item.name === $p('registerCountry').value);
    const raw = $p('registerPhone').value.trim();
    if (!country || !raw) return raw;
    if (raw.startsWith('+')) return raw;
    const digits = raw.replace(/\D/g, '');
    const local = digits.startsWith(country.dialCode.slice(1))
        ? digits.slice(country.dialCode.length - 1)
        : digits.replace(/^0+/, '');
    return `${country.dialCode}${local}`;
}
function updateGroupMomoFields() {
    const country = countryByName($p('groupCountry').value);
    const provider = $p('groupProvider');
    provider.replaceChildren(new Option(country ? 'Sélectionner un opérateur' : 'Choisissez d’abord un pays', ''));
    provider.disabled = !country;
    if (country) country.providers.forEach(name => provider.add(new Option(name, name)));
    $p('groupDialCode').textContent = country ? country.dialCode : '+--';
}
function normalizeMomoPhone(countryName, value) {
    const country = countryByName(countryName);
    const raw = String(value || '').trim();
    if (!country || !/^[+()\s.\d-]+$/.test(raw)) return raw;
    const digits = raw.replace(/\D/g, '');
    if (raw.startsWith('+')) return raw;
    const local = digits.startsWith(country.dialCode.slice(1)) ? digits.slice(country.dialCode.length - 1) : digits.replace(/^0+/, '');
    return `${country.dialCode}${local}`;
}
async function createGroup(event) {
    event.preventDefault();
    const data = await request('/api/groups', { method: 'POST', body: JSON.stringify({
        name: $p('groupName').value.trim(), country: $p('groupCountry').value, province: $p('groupProvince').value.trim(),
        city: $p('groupCity').value.trim(), momo_provider: $p('groupProvider').value,
        phone: normalizeMomoPhone($p('groupCountry').value, $p('groupPhone').value)
    }) });
    if (!data.dashboard || !data.accessToken || !data.refreshToken) throw new Error('Réponse de création de groupe incomplète.');
    ['accessToken', 'refreshToken', 'groupId', 'userId'].forEach(key => localStorage.removeItem(key));
    localStorage.setItem('accessToken', data.accessToken);
    localStorage.setItem('refreshToken', data.refreshToken);
    localStorage.setItem('groupId', String(data.dashboard.groupId));
    localStorage.setItem('userId', String(data.dashboard.memberId));
    window.location.assign(data.dashboard.path);
}
async function openGroupDashboard(groupId) {
    const data = await request(`/api/platform/groups/${encodeURIComponent(groupId)}/dashboard`, { method: 'POST', body: '{}' });
    if (!data.dashboard || !data.accessToken || !data.refreshToken) throw new Error('Réponse de tableau de bord incomplète.');
    localStorage.setItem('accessToken', data.accessToken);
    localStorage.setItem('refreshToken', data.refreshToken);
    localStorage.setItem('groupId', String(data.dashboard.groupId));
    localStorage.setItem('userId', String(data.dashboard.memberId));
    window.location.assign(data.dashboard.path);
}
async function inviteCandidate(groupId, candidate) {
    await request(`/api/platform/groups/${groupId}/invitations`, { method: 'POST', body: JSON.stringify({ account_id: candidate.id, role: 'membre' }) });
    notice(`Invitation envoyée à ${candidate.prenom} ${candidate.name}.`);
    loadFeed().catch(error => alert(error.message));
}
function renderCandidates(group, candidates) {
    const section = $p('inviteCandidatesSection');
    section.hidden = !group;
    if (!group) return;
    $p('inviteCandidates').replaceChildren(...candidates.map(candidate => {
        const row = document.createElement('div');
        row.className = 'member-item';
        row.innerHTML = `${avatarMarkup(candidate, 'chat-avatar')}<strong>${esc(candidate.prenom)} ${esc(candidate.name)}</strong><span class="field-hint">${candidate.availability === 'online' ? 'En ligne' : 'Membre éligible'}</span>`;
        const button = document.createElement('button');
        button.className = 'btn btn-primary';
        button.type = 'button';
        button.textContent = 'Proposer une invitation';
        button.onclick = () => inviteCandidate(group.id, candidate).catch(error => alert(error.message));
        row.appendChild(button);
        return row;
    }));
    hydrateProtectedMedia($p('inviteCandidates'));
}
async function loadGroups() {
    const [groupsData, invitations, mine] = await Promise.all([request('/api/platform/groups'), request('/api/platform/invitations'), request('/api/platform/my-groups')]);
    const isPresident = mine.groups.some(group => group.role === 'president');
    $p('createGroupForm').hidden = isPresident;
    $p('groupCreationStatus').hidden = !isPresident;
    $p('groupList').replaceChildren(...groupsData.groups.map(group => {
        const row = document.createElement('div');
        row.className = 'member-item';
        row.innerHTML = `<strong>${esc(group.name)}</strong> · ${esc(group.city || group.country)} · ${Number(group.member_count)} membre(s)`;
        const button = document.createElement('button');
        button.className = 'btn btn-secondary';
        button.textContent = 'Demander à rejoindre';
        button.onclick = async () => { await request(`/api/platform/groups/${group.id}/join-requests`, { method: 'POST', body: JSON.stringify({ note: '' }) }); notice('Demande envoyée au personnel du groupe.'); };
        row.appendChild(button);
        return row;
    }));
    $p('invitationList').replaceChildren(...invitations.invitations.filter(item => item.status === 'pending').map(invite => {
        const row = document.createElement('div');
        row.className = 'member-item';
        row.textContent = `${invite.group_name} — invitation de ${invite.inviter_prenom}`;
        ['Accepter', 'Décliner'].forEach((label, index) => {
            const button = document.createElement('button');
            button.className = `btn ${index ? 'btn-secondary' : 'btn-primary'}`;
            button.textContent = label;
            button.onclick = async () => { await request(`/api/platform/invitations/${invite.id}`, { method: 'PUT', body: JSON.stringify({ status: index ? 'declined' : 'accepted' }) }); loadGroups(); };
            row.appendChild(button);
        });
        return row;
    }));
    $p('myGroupList').replaceChildren(...mine.groups.map(group => {
        const row = document.createElement('div');
        row.className = 'member-item';
        row.innerHTML = `<strong>${esc(group.name)}</strong> — ${esc(group.role)}`;
        const open = document.createElement('button');
        open.className = 'btn btn-primary';
        open.type = 'button';
        open.textContent = 'Ouvrir le tableau de bord du groupe';
        open.onclick = () => openGroupDashboard(group.id).catch(error => alert(error.message));
        row.appendChild(open);
        if (['president', 'vice_president', 'comptable', 'secretaire'].includes(group.role)) {
            const requests = document.createElement('button');
            requests.className = 'btn btn-secondary';
            requests.textContent = 'Voir les demandes';
            requests.onclick = () => openGroupDashboard(group.id).catch(error => alert(error.message));
            const invite = document.createElement('button');
            invite.className = 'btn btn-primary';
            invite.textContent = 'Rechercher et inviter';
            invite.onclick = () => openGroupDashboard(group.id).catch(error => alert(error.message));
            row.append(requests, invite);
        }
        return row;
    }));
}
function memberRow(member, discover = false) {
    const row = document.createElement('div');
    row.className = 'member-item';
    row.innerHTML = `${avatarMarkup(member, 'chat-avatar')}<strong>${esc(member.prenom)} ${esc(member.name)}</strong><span class="field-hint">${esc(member.identifier)} · ${esc(member.availability)}</span>`;
    const button = document.createElement('button');
    button.className = 'btn btn-primary';
    button.textContent = discover ? 'Se connecter' : 'Messages';
    button.onclick = async () => {
        if (discover) { await request('/api/platform/friends/requests', { method: 'POST', body: JSON.stringify({ account_id: member.id }) }); notice('Demande de connexion envoyée.'); }
        else openDm(member);
    };
    row.appendChild(button);
    return row;
}
async function search(event) {
    event.preventDefault();
    const results = await request(`/api/platform/members/search?q=${encodeURIComponent($p('memberSearch').value.trim())}`);
    $p('searchResults').replaceChildren(...results.members.map(member => memberRow(member, true)));
    hydrateProtectedMedia($p('searchResults'));
}
function renderOnlineFriends() {
    const online = friends.filter(friend => friend.status === 'accepted' && friend.availability === 'online');
    $p('onlineFriends').innerHTML = online.length
        ? online.map(friend => `<div class="presence-member">${avatarMarkup(friend, 'chat-avatar')}<span class="presence-dot availability-online" aria-hidden="true"></span><span>${esc(friend.prenom)} ${esc(friend.name)}</span><span class="field-hint">En ligne</span></div>`).join('')
        : '<p class="field-hint">Aucun contact n’est actuellement en ligne.</p>';
    hydrateProtectedMedia($p('onlineFriends'));
}
async function loadFriends() {
    const data = await request('/api/platform/friends');
    friends = data.friends;
    $p('friendList').replaceChildren(...friends.map(item => {
        const member = { id: item.member_id, prenom: item.prenom, name: item.name, identifier: item.identifier, availability: item.availability, avatar_media_id: item.avatar_media_id };
        const row = memberRow(member, item.status !== 'accepted');
        if (item.status === 'pending' && item.requested_by_account_id !== account.id) {
            row.lastChild.textContent = 'Accepter';
            row.lastChild.onclick = async () => { await request(`/api/platform/friends/${item.id}`, { method: 'PUT', body: JSON.stringify({ status: 'accepted' }) }); loadFriends(); };
        } else if (item.status !== 'accepted') row.lastChild.textContent = 'En attente';
        return row;
    }));
    $p('eventInvitees').replaceChildren(...friends.filter(item => item.status === 'accepted').map(item => {
        const label = document.createElement('label');
        const input = document.createElement('input');
        input.type = 'checkbox';
        input.value = item.member_id;
        label.append(input, ` ${item.prenom} ${item.name}`);
        return label;
    }));
    hydrateProtectedMedia($p('friendList'));
    renderOnlineFriends();
}
function renderDmReactions(message) {
    const reactions = Array.isArray(message.reactions) ? message.reactions : [];
    return `<div class="reaction-row" aria-label="Réactions au message">${DM_REACTIONS.map(emoji => {
        const count = reactions.filter(reaction => reaction.emoji === emoji).length;
        const mine = reactions.some(reaction => Number(reaction.account_id) === Number(account.id) && reaction.emoji === emoji);
        return `<button class="reaction-button${mine ? ' is-active' : ''}" type="button" data-dm-message="${Number(message.id)}" data-emoji="${emoji}" aria-pressed="${mine}">${emoji}${count ? ` ${count}` : ''}</button>`;
    }).join('')}</div>`;
}
async function openDm(member) {
    selectedDm = member.id;
    $p('dmPanel').hidden = false;
    $p('dmTitle').textContent = `Discussion avec ${member.prenom} ${member.name}`;
    const data = await request(`/api/platform/dms/${member.id}`);
    $p('dmMessages').innerHTML = data.messages.map(message => `<article class="chat-message">${avatarMarkup(message)}<div class="chat-content"><strong>${esc(message.prenom)} ${esc(message.name)}</strong>${message.message ? `<p>${esc(message.message)}</p>` : ''}${message.attachment_id ? `<button class="attachment-download" type="button" data-dm-download="${Number(message.attachment_id)}">Télécharger : ${esc(message.attachment_name)}</button>` : ''}<small>${esc(new Date(message.created_at).toLocaleString('fr-FR'))}</small>${renderDmReactions(message)}</div></article>`).join('') || '<p>Aucun message pour le moment.</p>';
    hydrateProtectedMedia($p('dmMessages'));
    $p('dmMessages').scrollTop = $p('dmMessages').scrollHeight;
}
async function uploadDmAttachment(file) {
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'video/mp4', 'video/webm', 'application/pdf', 'text/plain', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'];
    if (!allowed.includes(file.type) || file.size > 6 * 1024 * 1024) throw new Error('Formats autorisés : documents, images ou vidéos jusqu’à 6 Mo.');
    return request(`/api/platform/dm-attachments/${selectedDm}`, { method: 'POST', headers: { 'Content-Type': file.type, 'X-File-Name': file.name }, body: file });
}
async function sendDm(event) {
    event.preventDefault();
    if (!selectedDm) return;
    const message = $p('dmInput').value.trim();
    if (!message && !selectedDmAttachment) throw new Error('Saisissez un message ou joignez un fichier.');
    const attachment = selectedDmAttachment ? await uploadDmAttachment(selectedDmAttachment) : null;
    await request(`/api/platform/dms/${selectedDm}`, { method: 'POST', body: JSON.stringify({ message, ...(attachment ? { attachment_id: attachment.attachment.id } : {}) }) });
    $p('dmInput').value = '';
    $p('dmAttachment').value = '';
    selectedDmAttachment = null;
    $p('dmAttachmentName').textContent = 'Maximum 6 Mo';
    const friend = friends.find(item => item.member_id === selectedDm);
    if (friend) openDm({ id: selectedDm, prenom: friend.prenom, name: friend.name });
}
async function downloadDmAttachment(id) {
    const response = await fetch(`${api}/api/platform/dm-attachments/${encodeURIComponent(id)}/download`, { headers: tokenHeaders() });
    if (!response.ok) throw new Error('Téléchargement impossible');
    const link = document.createElement('a');
    link.href = URL.createObjectURL(await response.blob());
    link.download = 'piece-jointe';
    link.click();
    URL.revokeObjectURL(link.href);
}
async function toggleDmReaction(messageId, emoji, active) {
    await request(`/api/platform/dms/${selectedDm}/messages/${messageId}/reactions${active ? `/${encodeURIComponent(emoji)}` : ''}`, {
        method: active ? 'DELETE' : 'POST', ...(active ? {} : { body: JSON.stringify({ emoji }) })
    });
    const friend = friends.find(item => item.member_id === selectedDm);
    if (friend) openDm({ id: selectedDm, prenom: friend.prenom, name: friend.name });
}
function renderComment(comment, postId, isPublic) {
    const pending = comment.moderation_status === 'pending' ? ' <em>(en examen humain)</em>' : '';
    const reactions = Array.isArray(comment.reactions) ? comment.reactions : [];
    const reactionButtons = ['👍', '❤️', '😂', '🙏', '🎉'].map(emoji => {
        const count = reactions.filter(item => item.reaction === emoji).length;
        const mine = reactions.some(item => Number(item.account_id) === Number(account.id) && item.reaction === emoji);
        return `<button class="reaction-button comment-reaction${mine ? ' is-active' : ''}" type="button" data-comment="${comment.id}" data-emoji="${emoji}" aria-pressed="${mine}">${emoji}${count ? ` ${count}` : ''}</button>`;
    }).join('');
    const price = isPublic ? 'Commentaire public : 0,25 USD-équivalent SANDBOX (0,125 plateforme / 0,125 auteur).' : 'Discussion privée/de contacts : gratuite.';
    return `<article class="feed-comment"><strong>${esc(comment.prenom)} ${esc(comment.name)}</strong>${pending}<p>${esc(comment.body)}</p><div class="reaction-row">${reactionButtons}</div><button class="btn btn-secondary reply-comment" data-post="${postId}" data-comment="${comment.id}" type="button">Répondre</button><form class="comment-form" data-post="${postId}" data-parent="${comment.id}" hidden><label>Réponse <textarea maxlength="800" required></textarea></label><small>${price}</small><button class="btn btn-primary">Envoyer la réponse</button></form></article>`;
}
function renderComments(post) {
    const comments = post.comments || [];
    const children = new Map();
    comments.forEach(comment => { const key = comment.parent_comment_id || 0; if (!children.has(key)) children.set(key, []); children.get(key).push(comment); });
    const isPublic = post.visibility === 'public';
    const branch = comment => `${renderComment(comment, post.id, isPublic)}<div class="comment-replies">${(children.get(comment.id) || []).map(branch).join('')}</div>`;
    const price = isPublic ? 'Commentaire public : 0,25 USD-équivalent SANDBOX (0,125 plateforme / 0,125 auteur).' : 'Discussion privée/de contacts : gratuite.';
    return `<section class="post-comments"><h4>Commentaires (${comments.length})</h4>${(children.get(0) || []).map(branch).join('') || '<p>Aucun commentaire pour le moment.</p>'}<form class="comment-form" data-post="${post.id}"><label for="comment-${post.id}">Ajouter un commentaire</label><textarea id="comment-${post.id}" maxlength="800" required></textarea><small>${price}</small><button class="btn btn-primary">Commenter</button></form></section>`;
}
async function loadFeed() {
    await loadFriends();
    const [data, mine] = await Promise.all([request('/api/social/feed'), request('/api/platform/my-groups')]);
    const staffGroup = mine.groups.find(group => ['president', 'vice_president', 'comptable', 'secretaire'].includes(group.role));
    if (staffGroup) {
        const candidates = await request(`/api/platform/groups/${staffGroup.id}/invite-candidates`);
        renderCandidates(staffGroup, candidates.members);
    } else renderCandidates(null, []);
    $p('feedList').innerHTML = data.posts.map(post => {
        const media = !post.media_id ? '' : `<${post.media_mime_type?.startsWith('video/') ? 'video controls' : 'img alt="Média partagé"'} class="feed-image protected-media" data-media-id="${Number(post.media_id)}"></${post.media_mime_type?.startsWith('video/') ? 'video' : 'img'}>`;
        const pending = post.moderation_status === 'pending' ? '<p class="field-hint">Votre publication est en examen humain et n’est visible que par vous.</p>' : '';
        return `<article class="feed-post"><div class="profile-summary">${avatarMarkup(post)}<strong>${esc(post.prenom)} ${esc(post.name)}</strong></div><p>${esc(post.body)}</p>${media}${pending}<p><button class="btn btn-secondary feed-reaction" data-post="${post.id}" type="button">👍 ${post.reaction_count}</button></p>${renderComments(post)}</article>`;
    }).join('') || '<p>Aucune publication visible pour le moment.</p>';
    hydrateProtectedMedia($p('feedList'));
}
function postPriceMinor(file) { return !file ? 10 : !file.type.startsWith('video/') ? 20 : Math.min(10000, 50 + (Math.max(1, Math.ceil(file.size / (1024 * 1024))) * 10)); }
function updatePostPrice() {
    const file = $p('postImage').files[0];
    $p('postPrice').textContent = `Prix avant publication : ${money(postPriceMinor(file))} (${file ? (file.type.startsWith('video/') ? 'vidéo' : 'image') : 'texte'}). Aucun transfert ni conversion réelle.`;
}
function paidMoney(minor) { return `${(minor / 100).toFixed(2).replace('.', ',')} USD-équivalent SANDBOX`; }
function durationDays(id) { return Math.max(1, Number($p(id).value) || 1); }
function paidContentPrice(file, days) {
    if (!file || !file.type.startsWith('video/')) return 25;
    return Math.max(1, Math.ceil(file.size / (1024 * 1024))) * 10 * days;
}
function renderPaidContentPrices() {
    if (!paidContentPrices) return;
    const prices = paidContentPrices.prices;
    $p('contentPriceTable').textContent = `Publicité texte/photo et annonce : ${paidMoney(prices.text_or_photo_advertisement_minor)}. Vidéo : ${paidMoney(prices.video_per_started_mebibyte_per_day_minor)} par Mo entamé et par jour (minimum ${prices.minimum_duration_days} jour). Commentaire public : 0,25 USD-équivalent, partagé 0,125 / 0,125.`;
    $p('paidPostPrice').textContent = `Prix avant paiement : ${paidMoney(paidContentPrice($p('paidPostMedia').files[0], durationDays('paidPostDuration')))}.`;
    $p('announcementPrice').textContent = `Prix avant paiement : ${paidMoney(paidContentPrice($p('announcementMedia').files[0], durationDays('announcementDuration')))}.`;
    const count = $p('advertisementPhotos').files.length;
    $p('advertisementPrice').textContent = `Prix avant paiement : ${paidMoney(prices.text_or_photo_advertisement_minor)} (${count} photo(s), ${durationDays('advertisementDuration')} jour(s)).`;
}
async function loadPaidContentPrices() {
    paidContentPrices = await request('/api/member-content/prices');
    renderPaidContentPrices();
}
async function uploadPublicContentMedia(files) {
    return Promise.all([...files].map(async file => {
        const data = await request('/api/social/uploads', {
            method: 'POST', headers: { 'Content-Type': file.type, 'X-File-Name': file.name }, body: file
        });
        return data.media.id;
    }));
}
async function submitPaidContent(event, contentType) {
    event.preventDefault();
    const form = event.target;
    let payload;
    let files;
    if (contentType === 'post') {
        files = $p('paidPostMedia').files;
        payload = { content_type: 'post', body: $p('paidPostBody').value.trim(), duration_days: durationDays('paidPostDuration'), payment_method: $p('paidPostPayment').value };
    } else if (contentType === 'announcement') {
        files = $p('announcementMedia').files;
        payload = { content_type: 'announcement', body: $p('announcementBody').value.trim(), duration_days: durationDays('announcementDuration'), payment_method: $p('announcementPayment').value };
    } else {
        files = $p('advertisementPhotos').files;
        if (files.length > 4) throw new Error('Une publicité peut contenir au maximum quatre photos.');
        payload = {
            content_type: 'advertisement', title: $p('advertisementTitle').value.trim(), body: $p('advertisementBody').value.trim(),
            product_price: $p('advertisementPriceValue').value.trim(), product_total: $p('advertisementTotal').value.trim(),
            availability: $p('advertisementAvailability').value.trim(), address: $p('advertisementAddress').value.trim(),
            contact_phone: $p('advertisementPhone').value.trim(), contact_email: $p('advertisementEmail').value.trim(),
            duration_days: durationDays('advertisementDuration'), payment_method: $p('advertisementPayment').value
        };
    }
    payload.media_ids = await uploadPublicContentMedia(files);
    const data = await request('/api/member-content', {
        method: 'POST', headers: { 'Idempotency-Key': idempotencyKey(`public-${contentType}`) }, body: JSON.stringify(payload)
    });
    form.reset();
    renderPaidContentPrices();
    $p('contentPaymentStatus').textContent = `Reçu ${data.receipt.payment_id} : ${data.receipt.display}. ${data.receipt.notice}`;
    pendingMomoPaymentId = data.receipt.provider === 'momo_sandbox' && data.receipt.status === 'pending' ? data.receipt.payment_id : null;
    $p('simulateMomoConfirmation').hidden = !pendingMomoPaymentId;
    if (!pendingMomoPaymentId) {
        await loadProfile();
        notice('Contenu public créé et validé. Il apparaît dans le fil public lorsqu’il est approuvé.');
    }
}
async function simulateMomoConfirmation() {
    if (!pendingMomoPaymentId) return;
    const data = await request(`/api/member-content/payments/${encodeURIComponent(pendingMomoPaymentId)}/simulate-confirmation`, {
        method: 'POST', headers: { 'Idempotency-Key': idempotencyKey('momo-sandbox-confirmation') }, body: '{}'
    });
    $p('contentPaymentStatus').textContent = `Confirmation simulée réussie. Reçu ${data.receipt.payment_id}. ${data.receipt.notice}`;
    pendingMomoPaymentId = null;
    $p('simulateMomoConfirmation').hidden = true;
    notice('Le contenu est maintenant admissible au fil public, sous réserve de son état d’approbation.');
}
async function publish(event) {
    event.preventDefault();
    const file = $p('postImage').files[0];
    const mediaId = file ? (await request('/api/social/uploads', { method: 'POST', headers: { 'Content-Type': file.type, 'X-File-Name': file.name }, body: file })).media.id : null;
    const data = await request('/api/social/posts', { method: 'POST', headers: { 'Idempotency-Key': idempotencyKey('post') }, body: JSON.stringify({ body: $p('postBody').value.trim(), visibility: $p('postVisibility').value, media_id: mediaId }) });
    event.target.reset();
    updatePostPrice();
    await loadFeed();
    notice(`Publication ajoutée. Reçu ${data.receipt.payment_id} : ${data.receipt.display}.`);
}
async function reactOrComment(event) {
    const button = event.target.closest('button');
    if (!button) return;
    if (button.classList.contains('feed-reaction')) { await request(`/api/social/posts/${button.dataset.post}/reactions`, { method: 'POST', body: JSON.stringify({ reaction: '👍' }) }); return loadFeed(); }
    if (button.classList.contains('comment-reaction')) {
        const active = button.classList.contains('is-active');
        await request(`/api/social/comments/${button.dataset.comment}/reactions${active ? `/${encodeURIComponent(button.dataset.emoji)}` : ''}`, { method: active ? 'DELETE' : 'POST', ...(active ? {} : { body: JSON.stringify({ reaction: button.dataset.emoji }) }) });
        return loadFeed();
    }
    if (button.classList.contains('reply-comment')) button.nextElementSibling.hidden = !button.nextElementSibling.hidden;
}
async function submitComment(event) {
    const form = event.target.closest('.comment-form');
    if (!form) return;
    event.preventDefault();
    const body = form.querySelector('textarea').value.trim();
    if (!body) return;
    const response = await request(`/api/social/posts/${form.dataset.post}/comments`, { method: 'POST', headers: { 'Idempotency-Key': idempotencyKey('comment') }, body: JSON.stringify({ body, ...(form.dataset.parent ? { parent_comment_id: Number(form.dataset.parent) } : {}) }) });
    notice(response.receipt
        ? `Commentaire ajouté. Reçu ${response.receipt.payment_id} : ${response.receipt.display}.`
        : 'Commentaire ajouté.');
    loadFeed();
}
async function createEvent(event) {
    event.preventDefault();
    const invitee_ids = [...$p('eventInvitees').querySelectorAll('input:checked')].map(input => Number(input.value));
    await request('/api/social/events', { method: 'POST', body: JSON.stringify({ title: $p('eventTitle').value.trim(), description: $p('eventDescription').value.trim(), starts_at: new Date($p('eventStarts').value).toISOString(), ends_at: new Date($p('eventEnds').value).toISOString(), invitee_ids }) });
    event.target.reset();
    loadEvents();
}
async function loadEvents() {
    await loadFriends();
    const data = await request('/api/social/events');
    $p('eventList').innerHTML = data.events.map(event => `<article class="meeting-item"><strong>${esc(event.title)}</strong> · ${new Date(event.starts_at).toLocaleString('fr-FR')} · ${esc(event.response)}</article>`).join('');
}
function insertEmoji(input, emoji) {
    const start = input.selectionStart ?? input.value.length;
    const end = input.selectionEnd ?? start;
    input.value = `${input.value.slice(0, start)}${emoji}${input.value.slice(end)}`.slice(0, 1000);
    input.focus();
}
function logout() {
    localStorage.removeItem('platformAccessToken');
    localStorage.removeItem('platformRefreshToken');
    mediaUrls.forEach(url => URL.revokeObjectURL(url));
    mediaUrls.clear();
    account = null;
    $p('portalSection').hidden = true;
    $p('authSection').hidden = false;
}
document.addEventListener('DOMContentLoaded', () => {
    applyUiLanguage(localStorage.getItem('platformUiLanguage') || 'fr');
    populateGroupCountries();
    populateRegisterCountries();
    $p('groupCountry').addEventListener('change', updateGroupMomoFields);
    $p('registerCountry').addEventListener('change', updateRegisterDialCode);
    $p('registerRequestCode').addEventListener('click', () => requestPhoneVerification('register', 'registerPhone', 'registerVerificationStatus').catch(error => showVerificationStatus('registerVerificationStatus', error.message)));
    $p('registerVerifyCode').addEventListener('click', () => verifyPhoneVerification('register', 'registerPhone', 'registerVerificationCode', 'registerVerificationStatus').catch(error => showVerificationStatus('registerVerificationStatus', error.message)));
    $p('profileRequestCode').addEventListener('click', () => requestPhoneVerification('profile', 'profileSecurityPhone', 'profileVerificationStatus').catch(error => showVerificationStatus('profileVerificationStatus', error.message)));
    $p('profileVerifyCode').addEventListener('click', () => verifyPhoneVerification('profile', 'profileSecurityPhone', 'profileVerificationCode', 'profileVerificationStatus').catch(error => showVerificationStatus('profileVerificationStatus', error.message)));
    $p('registerForm').addEventListener('submit', event => register(event).catch(error => alert(error.message)));
    $p('platformLoginForm').addEventListener('submit', event => login(event).catch(error => alert(error.message)));
    $p('pinResetRequestCode').addEventListener('click', () => requestPhoneVerification('reset', 'pinResetPhone', 'pinResetStatus').catch(error => showVerificationStatus('pinResetStatus', error.message)));
    $p('pinResetVerifyCode').addEventListener('click', () => verifyPhoneVerification('reset', 'pinResetPhone', 'pinResetCode', 'pinResetStatus').catch(error => showVerificationStatus('pinResetStatus', error.message)));
    $p('pinResetForm').addEventListener('submit', event => resetPin(event).catch(error => showVerificationStatus('pinResetStatus', error.message)));
    $p('walletTopupForm').addEventListener('submit', event => createWalletTopup(event).catch(error => notice(error.message)));
    $p('simulateWalletTopup').addEventListener('click', () => confirmWalletTopup().catch(error => notice(error.message)));
    $p('profileForm').addEventListener('submit', event => saveProfile(event).catch(error => alert(error.message)));
    $p('securityProfileForm').addEventListener('submit', event => saveSecurityProfile(event).catch(error => alert(error.message)));
    $p('avatarForm').addEventListener('submit', event => uploadAvatar(event).catch(error => alert(error.message)));
    $p('createGroupForm').addEventListener('submit', event => createGroup(event).catch(error => alert(error.message)));
    $p('searchForm').addEventListener('submit', event => search(event).catch(error => alert(error.message)));
    $p('dmForm').addEventListener('submit', event => sendDm(event).catch(error => alert(error.message)));
    $p('dmAttachment').addEventListener('change', event => {
        selectedDmAttachment = event.target.files && event.target.files[0];
        $p('dmAttachmentName').textContent = selectedDmAttachment ? `${selectedDmAttachment.name} (${Math.ceil(selectedDmAttachment.size / 1024)} Ko)` : 'Maximum 6 Mo';
    });
    $p('dmCamera').addEventListener('change', event => {
        selectedDmAttachment = event.target.files && event.target.files[0];
        $p('dmAttachmentName').textContent = selectedDmAttachment ? `${selectedDmAttachment.name} (${Math.ceil(selectedDmAttachment.size / 1024)} Ko)` : 'Maximum 6 Mo';
    });
    $p('dmAttachmentMenu').addEventListener('click', () => {
        const choices = $p('dmAttachmentChoices');
        choices.hidden = !choices.hidden;
        $p('dmAttachmentMenu').setAttribute('aria-expanded', String(!choices.hidden));
    });
    $p('dmEmojiButton').addEventListener('click', () => {
        $p('dmEmojiPicker').hidden = !$p('dmEmojiPicker').hidden;
        $p('dmEmojiButton').setAttribute('aria-expanded', String(!$p('dmEmojiPicker').hidden));
    });
    $p('dmEmojiPicker').addEventListener('click', event => {
        if (event.target.tagName !== 'BUTTON') return;
        insertEmoji($p('dmInput'), event.target.textContent);
        $p('dmEmojiPicker').hidden = true;
        $p('dmEmojiButton').setAttribute('aria-expanded', 'false');
    });
    $p('dmMessages').addEventListener('click', event => {
        const reaction = event.target.closest('[data-dm-message]');
        const download = event.target.closest('[data-dm-download]');
        if (reaction) toggleDmReaction(reaction.dataset.dmMessage, reaction.dataset.emoji, reaction.classList.contains('is-active')).catch(error => alert(error.message));
        if (download) downloadDmAttachment(download.dataset.dmDownload).catch(error => alert(error.message));
    });
    $p('postForm').addEventListener('submit', event => publish(event).catch(error => alert(error.message)));
    $p('postImage').addEventListener('change', updatePostPrice);
    $p('paidPostForm').addEventListener('submit', event => submitPaidContent(event, 'post').catch(error => alert(error.message)));
    $p('announcementForm').addEventListener('submit', event => submitPaidContent(event, 'announcement').catch(error => alert(error.message)));
    $p('advertisementForm').addEventListener('submit', event => submitPaidContent(event, 'advertisement').catch(error => alert(error.message)));
    $p('paidPostMedia').addEventListener('change', renderPaidContentPrices);
    $p('announcementMedia').addEventListener('change', renderPaidContentPrices);
    $p('advertisementPhotos').addEventListener('change', renderPaidContentPrices);
    ['paidPostDuration', 'announcementDuration', 'advertisementDuration'].forEach(id => $p(id).addEventListener('input', renderPaidContentPrices));
    $p('simulateMomoConfirmation').addEventListener('click', () => simulateMomoConfirmation().catch(error => alert(error.message)));
    $p('feedList').addEventListener('click', event => reactOrComment(event).catch(error => alert(error.message)));
    $p('feedList').addEventListener('submit', event => submitComment(event).catch(error => alert(error.message)));
    $p('eventForm').addEventListener('submit', event => createEvent(event).catch(error => alert(error.message)));
    $p('portalLogout').addEventListener('click', logout);
    $p('uiLanguage').addEventListener('change', event => {
        languageOverridden = true;
        localStorage.setItem('platformUiLanguageOverride', 'true');
        applyUiLanguage(event.target.value);
    });
    $p('registerCountry').addEventListener('change', () => {
        updateRegisterDialCode();
        chooseCountryLanguage($p('registerCountry').value);
    });
    document.querySelectorAll('[data-screen]').forEach(button => button.addEventListener('click', () => show(button.dataset.screen)));
    if (typeof window.addEventListener === 'function') {
        window.addEventListener('popstate', event => {
            const screen = event.state && event.state.platformScreen;
            if (screen) show(screen, { history: false });
        });
    }
    if (localStorage.getItem('platformAccessToken')) enter().catch(logout);
});
