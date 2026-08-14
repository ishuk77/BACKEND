const API_BASE = window.location.origin;
const STAFF_ROLES = ['president', 'vice_president', 'comptable', 'secretaire'];
let currentUser = null;
let members = [];
let groupInfo = null;
let currentAction = null;
let selectedAttachment = null;

const $ = id => document.getElementById(id);
const escapeHtml = value => String(value == null ? '' : value).replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
}[char]));
const currency = () => groupInfo && groupInfo.currency ? groupInfo.currency : 'XOF';
const roleLabel = role => ({
    membre: 'Membre', parrain: 'Parrain ou marraine', president: 'Président·e',
    vice_president: 'Vice-président·e', secretaire: 'Secrétaire', comptable: 'Comptable'
}[role] || role);

function setTokens(accessToken, refreshToken, groupId, userId) {
    localStorage.setItem('accessToken', accessToken);
    localStorage.setItem('refreshToken', refreshToken);
    if (groupId != null) localStorage.setItem('groupId', groupId);
    if (userId != null) localStorage.setItem('userId', userId);
}

function clearTokens() {
    ['accessToken', 'refreshToken', 'groupId', 'userId'].forEach(key => localStorage.removeItem(key));
}

async function apiRequest(path, options = {}, retry = true) {
    const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
    const accessToken = localStorage.getItem('accessToken');
    if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
    let response = await fetch(`${API_BASE}${path}`, { ...options, headers });

    if (retry && (response.status === 401 || response.status === 403)) {
        const refreshToken = localStorage.getItem('refreshToken');
        if (refreshToken) {
            const refresh = await fetch(`${API_BASE}/api/auth/refresh`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ refreshToken })
            });
            if (refresh.ok) {
                const tokens = await refresh.json();
                setTokens(tokens.accessToken, tokens.refreshToken || refreshToken);
                return apiRequest(path, options, false);
            }
        }
    }

    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Une erreur est survenue');
    return data;
}

function showSection(id) {
    document.querySelectorAll('main > section').forEach(section => { section.hidden = section.id !== id; });
    $('profileButton').setAttribute('aria-expanded', id === 'profileSection' ? 'true' : 'false');
    window.scrollTo(0, 0);
}

function showNotice(message) {
    const notice = $('notifications');
    notice.textContent = message;
    notice.style.display = 'block';
}

function showDashboard() {
    showSection('userPanel');
    renderDashboard();
}

function renderDashboard() {
    if (!currentUser) return;
    $('profileButton').hidden = false;
    $('userName').textContent = `${currentUser.prenom} ${currentUser.name}`;
    $('userRole').textContent = `${roleLabel(currentUser.role)}${currentUser.role_origin === 'bootstrap' && STAFF_ROLES.includes(currentUser.role) ? ' — titulaire transitoire (bootstrap)' : ''}`;
    $('profileAvatar').textContent = `${currentUser.prenom || ''}${currentUser.name || ''}`.trim().slice(0, 2).toUpperCase() || 'A';
    $('profileAvatar').className = `profile-avatar availability-${currentUser.availability || 'offline'}`;
    $('memberWallet').textContent = Number(currentUser.wallet || 0);
    $('memberContribution').textContent = Number(currentUser.contribution || 0);
    $('memberCredit').textContent = Number(currentUser.credit || 0);
    $('memberInterest').textContent = Number(currentUser.interest || 0);
    document.querySelectorAll('.currencySymbol').forEach(element => { element.textContent = currency(); });
    $('adminDashboard').hidden = !STAFF_ROLES.includes(currentUser.role);
    $('btnPlatformConversation').hidden = currentUser.role !== 'president';
    const isBlocked = Boolean(groupInfo && groupInfo.blocked);
    document.querySelectorAll('.member-action').forEach(button => {
        const allowedWhileBlocked = button.dataset.action === 'fraud';
        button.disabled = isBlocked && !allowedWhileBlocked;
        button.setAttribute('aria-disabled', String(button.disabled));
    });
    ['closeCycle', 'distributeCycle'].forEach(id => {
        if ($(id)) $(id).disabled = isBlocked;
    });
    $('btnRequestReview').hidden = !(isBlocked && currentUser.role === 'president');
    $('groupInfo').innerHTML = groupInfo
        ? `<strong>${escapeHtml(groupInfo.name)}</strong> · ${escapeHtml(groupInfo.country)} · Portefeuille : ${Number(groupInfo.wallet || 0)} ${escapeHtml(currency())}${isBlocked ? ' · <strong>GROUPE BLOQUÉ — opérations financières suspendues</strong>' : ''}`
        : '';
    if (isBlocked) showNotice('Ce groupe est bloqué après un signalement de fraude. Les opérations financières sont suspendues.');
}

async function loadUserData() {
    const userId = localStorage.getItem('userId');
    if (!userId) throw new Error('Session introuvable');
    currentUser = await apiRequest(`/api/members/${encodeURIComponent(userId)}`);
    if (currentUser.role === 'plateforme') return;
    const groupData = await apiRequest(`/api/groups/${encodeURIComponent(currentUser.group_id)}`);
    groupInfo = groupData.group;
    members = groupData.members;
    currentUser = members.find(member => String(member.id) === String(currentUser.id)) || currentUser;
    localStorage.setItem('groupId', currentUser.group_id);
}

async function login(event) {
    event.preventDefault();
    const phone = $('loginPhone').value.trim();
    const pin = $('loginPin').value.trim();
    // The historical form remains a compatible entry point, but all group
    // members now establish the canonical platform session first.
    let response = await fetch(`${API_BASE}/api/platform/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, pin })
    });
    let data = await response.json().catch(() => ({}));
    if (response.ok) {
        localStorage.setItem('platformAccessToken', data.accessToken);
        localStorage.setItem('platformRefreshToken', data.refreshToken);
        window.location.assign('platform.html');
        return;
    }

    // Platform administrators intentionally keep their separate dashboard.
    response = await fetch(`${API_BASE}/api/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phone, pin })
    });
    data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Connexion impossible');
    if (data.member.role === 'plateforme') {
        localStorage.setItem('platformAccessToken', data.accessToken);
        localStorage.setItem('platformRefreshToken', data.refreshToken);
        localStorage.setItem('platformUserId', data.memberId);
        window.location.assign('admin.html');
        return;
    }
    setTokens(data.accessToken, data.refreshToken, data.groupId, data.memberId);
    await loadUserData();
    showDashboard();
    showNotice('Connexion réussie.');
}

async function createGroup(event) {
    event.preventDefault();
    window.location.assign('platform.html');
}

function openProfile() {
    $('profilePrenom').value = currentUser.prenom || '';
    $('profileName').value = currentUser.name || '';
    $('profilePhone').value = currentUser.phone || '';
    $('profileAvailability').value = currentUser.availability || 'offline';
    $('profileIdentifier').textContent = currentUser.member_id || `AVEC-${currentUser.id}`;
    $('profilePhotoPlaceholder').textContent = `${currentUser.prenom || ''}${currentUser.name || ''}`.trim().slice(0, 2).toUpperCase() || 'A';
    showSection('profileSection');
}

async function saveProfile(event) {
    event.preventDefault();
    await apiRequest(`/api/members/${currentUser.id}/profile`, {
        method: 'PUT',
        body: JSON.stringify({
            prenom: $('profilePrenom').value.trim(),
            name: $('profileName').value.trim(),
            phone: $('profilePhone').value.trim(),
            availability: $('profileAvailability').value
        })
    });
    await loadUserData();
    showDashboard();
    showNotice('Profil mis à jour.');
}

const actionConfig = {
    contribution: { title: 'Contribuer', endpoint: 'contributions', submit: 'Enregistrer la contribution' },
    credit: { title: 'Demander un crédit', endpoint: 'credit-request', submit: 'Envoyer la demande', reason: 'Motif de la demande' },
    repayment: { title: 'Rembourser un crédit', endpoint: 'repayments', submit: 'Enregistrer le remboursement' },
    withdrawal: { title: 'Retirer des fonds', endpoint: 'withdrawals', submit: 'Confirmer le retrait' },
    fraud: { title: 'Signaler une fraude', endpoint: 'fraud-reports', submit: 'Envoyer le signalement', reason: 'Décrivez le signalement', amount: false }
};

function openAction(action) {
    if (groupInfo && groupInfo.blocked && action !== 'fraud') {
        showNotice('Les opérations financières sont suspendues pendant le blocage du groupe.');
        return;
    }
    currentAction = action;
    const config = actionConfig[action];
    $('transactionTitle').textContent = config.title;
    $('transactionSubmit').textContent = config.submit;
    $('transactionForm').reset();
    $('amountGroup').hidden = config.amount === false;
    $('transactionAmount').disabled = config.amount === false;
    $('reasonGroup').hidden = !config.reason;
    $('transactionReason').required = Boolean(config.reason);
    $('reasonLabel').textContent = config.reason || 'Motif';
    showSection('transactionSection');
}

async function submitAction(event) {
    event.preventDefault();
    const config = actionConfig[currentAction];
    const payload = config.amount === false
        ? { details: $('transactionReason').value.trim() }
        : { amount: Number($('transactionAmount').value), ...(config.reason ? { reason: $('transactionReason').value.trim() } : {}) };
    await apiRequest(`/api/members/${currentUser.id}/${config.endpoint}`, {
        method: 'POST',
        body: JSON.stringify(payload)
    });
    await loadUserData();
    showDashboard();
    showNotice(currentAction === 'fraud'
        ? 'Signalement enregistré. Le groupe est maintenant bloqué et tous les membres sont informés.'
        : 'Opération enregistrée.');
}

function showAddMember() {
    $('addMemberForm').reset();
    $('memberAccountResults').innerHTML = '<p>Recherchez un compte plateforme actif pour lui envoyer une invitation.</p>';
    loadMembershipGovernance().catch(error => showNotice(error.message));
    showSection('addMemberSection');
}

async function addMember(event) {
    event.preventDefault();
    const term = $('memberAccountSearch').value.trim();
    const data = await apiRequest(`/api/groups/${encodeURIComponent(groupInfo.id)}/account-search?q=${encodeURIComponent(term)}`);
    $('memberAccountResults').innerHTML = data.accounts.length
        ? data.accounts.map(account => `<article class="membre"><h3>${escapeHtml(account.prenom)} ${escapeHtml(account.name)}</h3><p>${escapeHtml(account.identifier)} · ${escapeHtml(account.phone || 'Téléphone non affiché')}</p><button class="btn btn-primary invite-account-button" type="button" data-account-id="${Number(account.id)}">Envoyer l’invitation</button></article>`).join('')
        : '<p>Aucun compte plateforme actif et finalisé ne correspond à cette recherche.</p>';
}

async function loadMembershipGovernance() {
    const [invitations, requests] = await Promise.all([
        apiRequest(`/api/groups/${encodeURIComponent(groupInfo.id)}/invitations`),
        apiRequest(`/api/groups/${encodeURIComponent(groupInfo.id)}/join-requests`)
    ]);
    $('groupInvitations').innerHTML = invitations.invitations.length
        ? invitations.invitations.map(invite => `<article class="membre"><strong>${escapeHtml(invite.prenom)} ${escapeHtml(invite.name)}</strong><p>${escapeHtml(invite.identifier)} — ${escapeHtml(invite.status === 'pending' ? 'Invitation en attente' : invite.status === 'accepted' ? 'Invitation acceptée' : 'Invitation déclinée')}</p></article>`).join('')
        : '<p>Aucune invitation envoyée.</p>';
    $('groupJoinRequests').innerHTML = requests.requests.length
        ? requests.requests.map(request => `<article class="membre"><strong>${escapeHtml(request.prenom)} ${escapeHtml(request.name)}</strong><p>${escapeHtml(request.identifier)} — ${escapeHtml(request.status === 'pending' ? 'Demande en attente' : request.status)}</p>${request.status === 'pending' ? `<button class="btn btn-primary approve-request-button" data-request-id="${Number(request.id)}" type="button">Admettre</button><button class="btn btn-secondary reject-request-button" data-request-id="${Number(request.id)}" type="button">Refuser</button>` : ''}</article>`).join('')
        : '<p>Aucune demande d’adhésion.</p>';
}

async function invitePlatformAccount(accountId) {
    await apiRequest(`/api/groups/${encodeURIComponent(groupInfo.id)}/invitations`, {
        method: 'POST', body: JSON.stringify({ account_id: Number(accountId) })
    });
    showNotice('Invitation envoyée. Le compte deviendra membre après son acceptation.');
    await loadMembershipGovernance();
}

async function decideJoinRequest(requestId, status) {
    await apiRequest(`/api/groups/${encodeURIComponent(groupInfo.id)}/join-requests/${encodeURIComponent(requestId)}`, {
        method: 'PUT', body: JSON.stringify({ status })
    });
    showNotice(status === 'approved' ? 'Demande approuvée : le compte est désormais membre actif.' : 'Demande refusée.');
    await Promise.all([loadMembershipGovernance(), loadUserData()]);
}

function renderElectionCandidates() {
    $('electionCandidates').innerHTML = members.length
        ? members.map(member => `<label><input type="checkbox" name="electionCandidate" value="${Number(member.id)}"> ${escapeHtml(member.prenom)} ${escapeHtml(member.name)} — ${escapeHtml(roleLabel(member.role))}</label>`).join('<br>')
        : '<p>Aucun membre actif.</p>';
}

async function showElections() {
    const staff = STAFF_ROLES.includes(currentUser.role);
    $('electionProposalForm').hidden = !staff;
    if (staff) renderElectionCandidates();
    await loadElections();
    showSection('electionsSection');
}

async function loadElections() {
    const data = await apiRequest(`/api/groups/${encodeURIComponent(groupInfo.id)}/elections`);
    $('electionList').innerHTML = data.elections.length
        ? data.elections.map(election => {
            const status = election.status === 'open' ? 'Vote ouvert' : election.status === 'closed_elected' ? 'Élu·e' : 'Aucune élection';
            const candidates = election.candidates.map(candidate => `<li>${escapeHtml(candidate.prenom)} ${escapeHtml(candidate.name)} — <strong>${Number(candidate.vote_count)} voix</strong>${election.status === 'open' && !election.has_voted ? ` <button class="btn btn-primary election-vote-button" type="button" data-election-id="${Number(election.id)}" data-candidate-id="${Number(candidate.member_id)}">Voter</button>` : ''}</li>`).join('');
            return `<article class="membre"><h3>${escapeHtml(election.title)}</h3><p>Fonction : ${escapeHtml(roleLabel(election.role))} · ${escapeHtml(status)}</p><p>Seuil : <strong>${Number(election.required_votes)} voix</strong> sur ${Number(election.active_member_count)} membres actifs${election.has_voted ? ' · Votre vote est enregistré.' : ''}</p><ul>${candidates}</ul>${election.status === 'open' && STAFF_ROLES.includes(currentUser.role) ? `<button class="btn btn-secondary election-close-button" type="button" data-election-id="${Number(election.id)}">Clôturer et calculer</button>` : ''}</article>`;
        }).join('')
        : '<p>Aucune élection ouverte ou clôturée. Le personnel peut proposer une fonction et les candidatures.</p>';
}

async function proposeElection(event) {
    event.preventDefault();
    const candidates = [...document.querySelectorAll('input[name="electionCandidate"]:checked')].map(input => Number(input.value));
    await apiRequest(`/api/groups/${encodeURIComponent(groupInfo.id)}/elections`, {
        method: 'POST',
        body: JSON.stringify({ role: $('electionRole').value, title: $('electionTitle').value.trim(), candidate_member_ids: candidates })
    });
    $('electionProposalForm').reset();
    showNotice('Élection ouverte et membres informés.');
    await loadElections();
}

async function voteInElection(electionId, candidateId) {
    await apiRequest(`/api/groups/${encodeURIComponent(groupInfo.id)}/elections/${encodeURIComponent(electionId)}/votes`, {
        method: 'POST', body: JSON.stringify({ candidate_member_id: Number(candidateId) })
    });
    showNotice('Votre vote est enregistré. Il ne peut pas être dupliqué.');
    await loadElections();
}

async function closeElection(electionId) {
    await apiRequest(`/api/groups/${encodeURIComponent(groupInfo.id)}/elections/${encodeURIComponent(electionId)}/close`, { method: 'POST', body: '{}' });
    await loadUserData();
    await loadElections();
    showNotice('Élection clôturée : le seuil a été calculé sur tous les membres actifs.');
}

function showCycle() {
    $('cycleLength').value = groupInfo.cycle_length || 6;
    $('cycleInfo').textContent = `Cycle actuel : ${groupInfo.cycle_length || 6} mois.`;
    showSection('cycleSection');
}

async function updateCycle() {
    await apiRequest(`/api/groups/${groupInfo.id}`, {
        method: 'PUT',
        body: JSON.stringify({ cycle_length: Number($('cycleLength').value) })
    });
    await loadUserData();
    showCycle();
    showNotice('Durée du cycle enregistrée.');
}

async function cycleOperation(operation, confirmation) {
    if (!confirm(confirmation)) return;
    const data = await apiRequest(`/api/groups/${groupInfo.id}/cycle/${operation}`, { method: 'POST', body: '{}' });
    await loadUserData();
    showDashboard();
    showNotice(operation === 'distribute' ? `Cycle partagé entre ${data.members} membre(s).` : 'Cycle clôturé.');
}

async function showStats() {
    const data = await apiRequest('/api/stats');
    const stats = data.stats;
    $('stats').innerHTML = [
        ['Membres', stats.count],
        ['Portefeuille total', `${stats.totalWallet} ${currency()}`],
        ['Contributions totales', `${stats.totalContributions} ${currency()}`],
        ['Crédits actifs', `${stats.totalCredit} ${currency()}`]
    ].map(([label, value]) => `<div class="stat-item">${label} : ${escapeHtml(value)}</div>`).join('');
    showSection('statsSection');
}

function showMembers() {
    $('listeMembres').innerHTML = members.map(member => `
        <article class="membre">
            <h3><span class="presence-dot availability-${escapeHtml(member.availability || 'offline')}" aria-hidden="true"></span>${escapeHtml(member.prenom)} ${escapeHtml(member.name)}${member.id === currentUser.id ? ' (vous)' : ''}</h3>
            <p>Rôle : ${escapeHtml(roleLabel(member.role))}${member.role_origin === 'bootstrap' && STAFF_ROLES.includes(member.role) ? ' — titulaire transitoire (bootstrap)' : ''}</p>
            <p>Disponibilité : ${availabilityLabel(member.availability)}</p>
            <p>Identifiant : ${escapeHtml(member.member_id || `AVEC-${member.id}`)}</p>
            <p>Téléphone : ${escapeHtml(member.phone)}</p>
            <p>Portefeuille : ${Number(member.wallet || 0)} ${escapeHtml(currency())}</p>
        </article>`).join('') || '<p>Aucun membre.</p>';
    showSection('memberListSection');
}

async function showHistory() {
    const records = await apiRequest(`/api/history?member_id=${encodeURIComponent(currentUser.id)}`);
    $('memberHistory').innerHTML = records.length
        ? records.map(record => `<div class="history-item"><strong>${escapeHtml(record.action)}</strong><br><small>${escapeHtml(new Date(record.date).toLocaleString('fr-FR'))}</small></div>`).join('')
        : '<p>Aucun mouvement enregistré.</p>';
    showSection('historySection');
}

function availabilityLabel(value) {
    return ({ online: 'En ligne', busy: 'Occupé·e', offline: 'Hors ligne' })[value] || 'Hors ligne';
}

function renderChat(messages) {
    const windowElement = $('chatWindow');
    windowElement.innerHTML = messages.length ? messages.map(message => `
        <div class="chat-message">
            <span class="chat-avatar availability-${escapeHtml(message.availability || 'offline')}" aria-hidden="true">${escapeHtml((message.prenom || '?').slice(0, 1).toUpperCase())}</span>
            <div class="chat-content"><strong>${escapeHtml(message.prenom || 'Membre')} ${escapeHtml(message.name || '')}</strong>${message.message ? `<br>${escapeHtml(message.message)}` : ''}${message.attachment_id ? `<br><button class="attachment-download" type="button" data-download-id="${Number(message.attachment_id)}">Télécharger : ${escapeHtml(message.attachment_name)}</button>` : ''}<br><small>${escapeHtml(new Date(message.date).toLocaleString('fr-FR'))}</small>${renderReactions(message)}</div>
        </div>`).join('') : '<p>Aucun message pour le moment.</p>';
    windowElement.scrollTop = windowElement.scrollHeight;
}

async function showChat() {
    const recipient = $('chatRecipient');
    recipient.innerHTML = '<option value="all">Tous les membres</option>';
    members.filter(member => member.id !== currentUser.id).forEach(member => {
        recipient.insertAdjacentHTML('beforeend', `<option value="${member.id}">${escapeHtml(member.prenom)} ${escapeHtml(member.name)}</option>`);
    });
    $('chatPresence').textContent = `${members.filter(member => member.availability === 'online').length} membre(s) en ligne`;
    selectedAttachment = null;
    $('chatAttachment').value = '';
    $('chatAttachmentName').textContent = 'Maximum 6 Mo';
    renderChat(await apiRequest(`/api/chat/${groupInfo.id}`));
    showSection('chatSection');
}

async function sendChat(event) {
    event.preventDefault();
    const text = $('chatInput').value.trim();
    if (!text && !selectedAttachment) throw new Error('Saisissez un message ou joignez un fichier.');
    let attachmentId;
    if (selectedAttachment) attachmentId = (await uploadChatAttachment(selectedAttachment)).id;
    await apiRequest('/api/chat', {
        method: 'POST',
        body: JSON.stringify({ group_id: groupInfo.id, recipient: $('chatRecipient').value, message: text, attachment_id: attachmentId })
    });
    $('chatInput').value = '';
    $('chatAttachment').value = '';
    selectedAttachment = null;
    $('chatAttachmentName').textContent = 'Maximum 6 Mo';
    renderChat(await apiRequest(`/api/chat/${groupInfo.id}`));
}

function renderReactions(message) {
    const reactions = Array.isArray(message.reactions) ? message.reactions : [];
    const emojis = ['👍', '❤️', '😂', '😮', '🙏'];
    return `<div class="reaction-row" aria-label="Réactions au message">${emojis.map(emoji => {
        const count = reactions.filter(reaction => reaction.emoji === emoji).length;
        const mine = reactions.some(reaction => String(reaction.member_id) === String(currentUser.id) && reaction.emoji === emoji);
        return `<button class="reaction-button${mine ? ' is-active' : ''}" type="button" data-message-id="${Number(message.id)}" data-emoji="${emoji}" aria-pressed="${mine}">${emoji}${count ? ` ${count}` : ''}</button>`;
    }).join('')}</div>`;
}

async function toggleReaction(messageId, emoji, active) {
    const encodedEmoji = encodeURIComponent(emoji);
    await apiRequest(`/api/chat/${encodeURIComponent(groupInfo.id)}/messages/${encodeURIComponent(messageId)}/reactions${active ? `/${encodedEmoji}` : ''}`, {
        method: active ? 'DELETE' : 'POST',
        ...(active ? {} : { body: JSON.stringify({ emoji }) })
    });
    renderChat(await apiRequest(`/api/chat/${groupInfo.id}`));
}

async function downloadAttachment(attachmentId) {
    const response = await fetch(`${API_BASE}/api/collaboration/attachments/${encodeURIComponent(attachmentId)}/download`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('accessToken')}` }
    });
    if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || 'Téléchargement impossible');
    }
    const link = document.createElement('a');
    const filename = (response.headers.get('Content-Disposition') || '').match(/filename\*=(?:UTF-8'')?([^;]+)/i);
    link.href = URL.createObjectURL(await response.blob());
    link.download = filename ? decodeURIComponent(filename[1]) : 'piece-jointe';
    link.click();
    URL.revokeObjectURL(link.href);
}

async function uploadChatAttachment(file) {
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'video/mp4', 'video/webm', 'application/pdf', 'text/plain',
        'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'];
    if (!allowed.includes(file.type) || file.size > 6 * 1024 * 1024) throw new Error('Formats autorisés : documents, images ou vidéos jusqu’à 6 Mo.');
    const response = await fetch(`${API_BASE}/api/collaboration/attachments`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${localStorage.getItem('accessToken')}`, 'Content-Type': file.type, 'X-File-Name': file.name },
        body: file
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Téléversement impossible');
    return data;
}

function showMediaSetup(kind) {
    const message = `Les ${kind} ne sont pas disponibles en local. Au déploiement, activez une signalisation WebRTC authentifiée, STUN/TURN, HTTPS et, pour les groupes, un SFU ou fournisseur de conférence sécurisé.`;
    $('mediaSetupState').hidden = false;
    $('mediaSetupState').textContent = message;
    alert(message);
}

function renderCollaborationMembers() {
    $('collaborationMembers').innerHTML = members.map(member => `
        <div class="presence-member">
            <span class="presence-dot availability-${escapeHtml(member.availability || 'offline')}" aria-hidden="true"></span>
            <span>${escapeHtml(member.prenom)} ${escapeHtml(member.name)}${member.id === currentUser.id ? ' (vous)' : ''}</span>
            <span class="field-hint">${availabilityLabel(member.availability)}</span>
        </div>`).join('');
}

function renderMeetings(meetings) {
    $('meetingCalendar').innerHTML = meetings.length ? meetings.map(meeting => `
        <article class="meeting-item">
            <div><h4>${escapeHtml(meeting.title)}</h4><p>${escapeHtml(new Date(meeting.starts_at).toLocaleString('fr-FR'))} — ${escapeHtml(new Date(meeting.ends_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }))}</p>${meeting.description ? `<p>${escapeHtml(meeting.description)}</p>` : ''}<p class="field-hint">Créée par ${escapeHtml(meeting.creator_prenom)} ${escapeHtml(meeting.creator_name)} · ${Number(meeting.invite_count)} invité(s)</p></div>
            <div class="meeting-response">${meeting.my_response ? `<span>Votre réponse : ${escapeHtml({ pending: 'En attente', accepted: 'Présent·e', declined: 'Indisponible' }[meeting.my_response])}</span><div><button type="button" class="btn btn-sm meeting-response-button" data-meeting-id="${Number(meeting.id)}" data-response="accepted">Présent·e</button><button type="button" class="btn btn-sm meeting-response-button" data-meeting-id="${Number(meeting.id)}" data-response="declined">Indisponible</button></div>` : '<span class="field-hint">Vous n’êtes pas invité·e</span>'}</div>
        </article>`).join('') : '<p>Aucune réunion planifiée.</p>';
}

async function showCollaboration() {
    renderCollaborationMembers();
    const canCreate = STAFF_ROLES.includes(currentUser.role);
    $('meetingForm').hidden = !canCreate;
    if (canCreate) {
        $('meetingRecipients').innerHTML = members.map(member => `<label class="recipient-option"><input type="checkbox" name="meetingRecipient" value="${Number(member.id)}" checked> ${escapeHtml(member.prenom)} ${escapeHtml(member.name)}</label>`).join('');
    }
    renderMeetings(await apiRequest(`/api/meetings/${encodeURIComponent(groupInfo.id)}`));
    showSection('collaborationSection');
}

async function createMeeting(event) {
    event.preventDefault();
    const recipientIds = [...document.querySelectorAll('input[name="meetingRecipient"]:checked')].map(input => Number(input.value));
    if (!recipientIds.length) throw new Error('Sélectionnez au moins un membre à inviter.');
    await apiRequest('/api/meetings', {
        method: 'POST',
        body: JSON.stringify({
            group_id: groupInfo.id,
            title: $('meetingTitle').value.trim(),
            description: $('meetingDescription').value.trim(),
            meeting_type: $('meetingType').value,
            starts_at: $('meetingStartsAt').value,
            ends_at: $('meetingEndsAt').value,
            recipient_ids: recipientIds
        })
    });
    $('meetingForm').reset();
    await showCollaboration();
    showNotice('Réunion planifiée et invitations enregistrées.');
}

async function respondToMeeting(meetingId, response) {
    await apiRequest(`/api/meetings/${encodeURIComponent(meetingId)}/invitation`, {
        method: 'PUT',
        body: JSON.stringify({ response })
    });
    await showCollaboration();
}

function renderPlatformConversation(messages) {
    const windowElement = $('platformConversationWindow');
    windowElement.innerHTML = messages.length ? messages.map(message => {
        const sender = message.role === 'plateforme'
            ? 'Plateforme AVEC'
            : `${message.prenom || 'Président'} ${message.name || ''}`.trim();
        return `<div class="chat-message">
            <span class="chat-avatar" aria-hidden="true">${escapeHtml(sender.slice(0, 1).toUpperCase())}</span>
            <div class="chat-content"><strong>${escapeHtml(sender)}</strong><br>${escapeHtml(message.message)}<br><small>${escapeHtml(new Date(message.date).toLocaleString('fr-FR'))}</small></div>
        </div>`;
    }).join('') : '<p>Aucun message de la plateforme pour le moment. Vous pouvez envoyer le premier message si nécessaire.</p>';
    windowElement.scrollTop = windowElement.scrollHeight;
}

async function showPlatformConversation() {
    if (!currentUser || currentUser.role !== 'president') {
        throw new Error('Cette conversation est réservée au président du groupe.');
    }
    const conversation = await apiRequest(`/api/platform-conversations/${encodeURIComponent(groupInfo.id)}`);
    renderPlatformConversation(conversation.messages);
    showSection('platformConversationSection');
}

async function sendPlatformConversation(event) {
    event.preventDefault();
    const input = $('platformConversationInput');
    await apiRequest(`/api/platform-conversations/${encodeURIComponent(groupInfo.id)}`, {
        method: 'POST',
        body: JSON.stringify({ message: input.value })
    });
    input.value = '';
    await showPlatformConversation();
}

function selectedMomoCountry() {
    return (window.MOMO_COUNTRIES || []).find(country => country.name === $('newGroupCountry').value);
}

function populateMomoCountries() {
    const select = $('newGroupCountry');
    select.replaceChildren(new Option('(sélectionner pays)', ''));
    (window.MOMO_COUNTRIES || []).forEach(country => select.add(new Option(country.name, country.name)));
    updateGroupMomoFields();
}

function updateGroupMomoFields() {
    const country = selectedMomoCountry();
    const provider = $('newGroupMomoProvider');
    provider.replaceChildren(new Option(country ? '(sélectionner opérateur)' : 'Choisissez d’abord un pays', ''));
    provider.disabled = !country;
    if (country) country.providers.forEach(entry => provider.add(new Option(entry, entry)));
    $('newGroupDialCode').textContent = country ? country.dialCode : '+--';
    $('newGroupPhone').dataset.dialCode = country ? country.dialCode : '';
    $('newGroupCurrency').replaceChildren(new Option(country ? country.currency : '(monnaie)', country ? country.currency : ''));
}

function normalizeMomoPhone(countryName, value) {
    const country = (window.MOMO_COUNTRIES || []).find(entry => entry.name === countryName);
    const raw = String(value || '').trim();
    if (!country || !/^[+()\s.\d-]+$/.test(raw)) return raw;
    const digits = raw.replace(/\D/g, '');
    if (raw.startsWith('+')) return raw;
    const local = digits.startsWith(country.dialCode.slice(1))
        ? digits.slice(country.dialCode.length - 1)
        : digits.replace(/^0+/, '');
    return `${country.dialCode}${local}`;
}

async function requestReview() {
    const message = window.prompt('Expliquez à la plateforme pourquoi le groupe peut être réactivé :');
    if (message === null) return;
    if (!message.trim()) {
        showNotice('Veuillez saisir un message de révision.');
        return;
    }
    await apiRequest(`/api/groups/${encodeURIComponent(groupInfo.id)}/review-requests`, {
        method: 'POST',
        body: JSON.stringify({ message: message.trim() })
    });
    showNotice('Demande de révision envoyée à la plateforme.');
}

function logout() {
    clearTokens();
    currentUser = null;
    members = [];
    groupInfo = null;
    $('profileButton').hidden = true;
    $('groupInfo').textContent = '';
    // Preserve the platform session so leaving a selected group always returns
    // to the unified member portal instead of a second dashboard landing page.
    if (localStorage.getItem('platformAccessToken')) {
        window.location.assign('platform.html');
        return;
    }
    showSection('initialSection');
}

document.addEventListener('DOMContentLoaded', async () => {
    populateMomoCountries();
    $('newGroupCountry').addEventListener('change', updateGroupMomoFields);
    $('btnCreateGroup').addEventListener('click', () => showSection('createGroupSection'));
    $('btnConnectGroup').addEventListener('click', () => showSection('loginSection'));
    document.querySelectorAll('.back-button').forEach(button => button.addEventListener('click', () => showSection('initialSection')));
    document.querySelectorAll('.dashboard-button').forEach(button => button.addEventListener('click', showDashboard));
    $('loginForm').addEventListener('submit', event => login(event).catch(error => alert(error.message)));
    $('createGroupForm').addEventListener('submit', event => createGroup(event).catch(error => alert(error.message)));
    $('btnLogout').addEventListener('click', logout);
    $('profileButton').addEventListener('click', openProfile);
    $('profileForm').addEventListener('submit', event => saveProfile(event).catch(error => alert(error.message)));
    document.querySelectorAll('.member-action').forEach(button => button.addEventListener('click', () => openAction(button.dataset.action)));
    $('transactionForm').addEventListener('submit', event => submitAction(event).catch(error => alert(error.message)));
    $('btnAddMember').addEventListener('click', showAddMember);
    $('addMemberForm').addEventListener('submit', event => addMember(event).catch(error => alert(error.message)));
    $('memberAccountResults').addEventListener('click', event => {
        const button = event.target.closest('.invite-account-button');
        if (button) invitePlatformAccount(button.dataset.accountId).catch(error => alert(error.message));
    });
    $('groupJoinRequests').addEventListener('click', event => {
        const approve = event.target.closest('.approve-request-button');
        const reject = event.target.closest('.reject-request-button');
        if (approve) decideJoinRequest(approve.dataset.requestId, 'approved').catch(error => alert(error.message));
        if (reject) decideJoinRequest(reject.dataset.requestId, 'rejected').catch(error => alert(error.message));
    });
    $('btnElections').addEventListener('click', () => showElections().catch(error => alert(error.message)));
    $('electionProposalForm').addEventListener('submit', event => proposeElection(event).catch(error => alert(error.message)));
    $('electionList').addEventListener('click', event => {
        const vote = event.target.closest('.election-vote-button');
        const close = event.target.closest('.election-close-button');
        if (vote) voteInElection(vote.dataset.electionId, vote.dataset.candidateId).catch(error => alert(error.message));
        if (close) closeElection(close.dataset.electionId).catch(error => alert(error.message));
    });
    $('btnManageCycle').addEventListener('click', showCycle);
    $('setCycle').addEventListener('click', () => updateCycle().catch(error => alert(error.message)));
    $('closeCycle').addEventListener('click', () => cycleOperation('close', 'Clôturer ce cycle ?').catch(error => alert(error.message)));
    $('distributeCycle').addEventListener('click', () => cycleOperation('distribute', 'Partager le portefeuille du groupe entre les contributeurs ?').catch(error => alert(error.message)));
    $('btnViewStats').addEventListener('click', () => showStats().catch(error => alert(error.message)));
    $('btnMembers').addEventListener('click', showMembers);
    $('btnRequestReview').addEventListener('click', () => requestReview().catch(error => alert(error.message)));
    $('btnMemberHistory').addEventListener('click', () => showHistory().catch(error => alert(error.message)));
    $('btnChat').addEventListener('click', () => showChat().catch(error => alert(error.message)));
    $('chatForm').addEventListener('submit', event => sendChat(event).catch(error => alert(error.message)));
    $('chatAttachment').addEventListener('change', event => {
        selectedAttachment = event.target.files && event.target.files[0];
        $('chatAttachmentName').textContent = selectedAttachment ? `${selectedAttachment.name} (${Math.ceil(selectedAttachment.size / 1024)} Ko)` : 'Maximum 6 Mo';
    });
    $('chatCamera').addEventListener('change', event => {
        selectedAttachment = event.target.files && event.target.files[0];
        $('chatAttachmentName').textContent = selectedAttachment ? `${selectedAttachment.name} (${Math.ceil(selectedAttachment.size / 1024)} Ko)` : 'Maximum 6 Mo';
    });
    $('chatAttachmentMenu').addEventListener('click', () => {
        const choices = $('chatAttachmentChoices');
        choices.hidden = !choices.hidden;
        $('chatAttachmentMenu').setAttribute('aria-expanded', String(!choices.hidden));
    });
    $('emojiPickerButton').addEventListener('click', () => {
        const picker = $('emojiPicker');
        picker.hidden = !picker.hidden;
        $('emojiPickerButton').setAttribute('aria-expanded', String(!picker.hidden));
    });
    $('emojiPicker').addEventListener('click', event => {
        const emoji = event.target.tagName === 'BUTTON' ? event.target.textContent : '';
        if (!emoji) return;
        const input = $('chatInput');
        const start = input.selectionStart || input.value.length;
        const end = input.selectionEnd || start;
        input.value = `${input.value.slice(0, start)}${emoji}${input.value.slice(end)}`.slice(0, 1000);
        input.focus();
        $('emojiPicker').hidden = true;
        $('emojiPickerButton').setAttribute('aria-expanded', 'false');
    });
    $('chatWindow').addEventListener('click', event => {
        const reaction = event.target.closest('.reaction-button');
        const download = event.target.closest('.attachment-download');
        if (reaction) toggleReaction(reaction.dataset.messageId, reaction.dataset.emoji, reaction.classList.contains('is-active')).catch(error => alert(error.message));
        if (download) downloadAttachment(download.dataset.downloadId).catch(error => alert(error.message));
    });
    $('btnAudioCall').addEventListener('click', () => showMediaSetup('planification d’appels audio de démonstration (aucun appel réel)'));
    $('btnVideoCall').addEventListener('click', () => showMediaSetup('planification d’appels vidéo de démonstration (aucun appel réel)'));
    $('btnGroupVideo').addEventListener('click', () => showMediaSetup('planification de conférences de démonstration (aucun appel réel)'));
    $('btnCollaboration').addEventListener('click', () => showCollaboration().catch(error => alert(error.message)));
    $('meetingForm').addEventListener('submit', event => createMeeting(event).catch(error => alert(error.message)));
    $('meetingCalendar').addEventListener('click', event => {
        const responseButton = event.target.closest('.meeting-response-button');
        if (responseButton) respondToMeeting(responseButton.dataset.meetingId, responseButton.dataset.response).catch(error => alert(error.message));
    });
    $('btnPlatformConversation').addEventListener('click', () => showPlatformConversation().catch(error => alert(error.message)));
    $('platformConversationForm').addEventListener('submit', event => sendPlatformConversation(event).catch(error => alert(error.message)));

    if (!localStorage.getItem('accessToken')) return showSection('initialSection');
    try {
        await loadUserData();
        if (currentUser.role === 'plateforme') return logout();
        showDashboard();
    } catch (error) {
        console.error(error);
        logout();
    }
});
