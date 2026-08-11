// === Administration Plateforme AVEC ===

// For production, change this to your deployed server URL
const API_BASE = window.location.origin;
const momoCountryByName = name => (window.MOMO_COUNTRIES || []).find(country => country.name === name);
let platformConversationGroups = [];
let selectedPlatformConversationId = '';

document.addEventListener('DOMContentLoaded', function() {
    // Platform login
    document.getElementById('platformLoginForm').addEventListener('submit', handlePlatformLogin);
    document.getElementById('platformSetupForm').addEventListener('submit', handlePlatformSetup);
    document.getElementById('btnShowPlatformSetup').addEventListener('click', showPlatformSetup);
    document.getElementById('btnBackToPlatformLogin').addEventListener('click', showPlatformLogin);

    // Admin actions
    document.getElementById('btnViewAllGroups').addEventListener('click', showAllGroups);
    document.getElementById('btnViewAllMembers').addEventListener('click', showAllMembers);
    document.getElementById('btnViewAlerts').addEventListener('click', showAlerts);
    document.getElementById('btnReviewRequests').addEventListener('click', showReviewRequests);
    document.getElementById('btnPlatformMessages').addEventListener('click', () => showPlatformMessages().catch(error => alert(error.message)));
    document.getElementById('btnManageMomo').addEventListener('click', showMomoManagement);
    document.getElementById('btnPaymentLedger').addEventListener('click', showPaymentLedger);
    document.getElementById('btnSocialModeration').addEventListener('click', () => showSocialModeration().catch(error => alert(error.message)));
    document.getElementById('btnPlatformStats').addEventListener('click', showPlatformStats);
    document.getElementById('btnDeploymentSettings').addEventListener('click', () => showDeploymentSettings().catch(error => alert(error.message)));
    document.getElementById('deploymentSettingsForm').addEventListener('submit', saveDeploymentSettings);
    document.querySelectorAll('.platform-back').forEach(button => button.addEventListener('click', showPlatformDashboard));

    // Momo management
    document.getElementById('btnAddMomo').addEventListener('click', handleAddMomo);
    document.getElementById('momoCountry').addEventListener('change', updateMomoFields);
    document.getElementById('platformConversationSearch').addEventListener('input', renderPlatformConversationChoices);
    document.getElementById('platformConversationSelect').addEventListener('change', event => {
        const groupId = event.target.value;
        if (groupId) loadPlatformConversation(groupId).catch(error => alert(error.message));
    });
    document.getElementById('platformConversationForm').addEventListener('submit', event => sendPlatformConversation(event).catch(error => alert(error.message)));
    populateMomoCountries();

    // Check if platform admin is already logged in
    const token = localStorage.getItem('platformAccessToken');
    if (token) {
        showPlatformDashboard();
    }
});

function populateMomoCountries() {
    const countrySelect = document.getElementById('momoCountry');
    countrySelect.replaceChildren(new Option('Sélectionner un pays', ''));
    (window.MOMO_COUNTRIES || []).forEach(country => {
        const option = document.createElement('option');
        option.value = country.name;
        option.textContent = country.name;
        countrySelect.appendChild(option);
    });
    updateMomoFields();
}

function updateMomoFields() {
    const country = momoCountryByName(document.getElementById('momoCountry').value);
    const providerSelect = document.getElementById('momoProvider');
    providerSelect.replaceChildren(new Option(country ? 'Sélectionner un opérateur' : 'Choisissez d’abord un pays', ''));
    providerSelect.disabled = !country;
    if (country) {
        country.providers.forEach(provider => providerSelect.add(new Option(provider, provider)));
    }
    document.getElementById('momoDialCode').textContent = country ? country.dialCode : '+--';
    document.getElementById('momoPhone').dataset.dialCode = country ? country.dialCode : '';
}

async function apiRequest(path, options = {}) {
    const token = localStorage.getItem('platformAccessToken');
    const headers = options.headers || {};
    headers['Content-Type'] = 'application/json';
    if (token) headers['Authorization'] = `Bearer ${token}`;

    let res = await fetch(API_BASE + path, { ...options, headers });
    if (res.status === 401 || res.status === 403) {
        // Try to refresh token if available
        const refreshToken = localStorage.getItem('platformRefreshToken');
        if (refreshToken) {
            const refresh = await fetch(API_BASE + '/api/auth/refresh', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ refreshToken })
            });
            if (refresh.ok) {
                const data = await refresh.json();
                if (data.accessToken) {
                    localStorage.setItem('platformAccessToken', data.accessToken);
                    headers['Authorization'] = `Bearer ${data.accessToken}`;
                    res = await fetch(API_BASE + path, { ...options, headers });
                }
            }
        }
    }

    if (res.status === 401 || res.status === 403) {
        platformLogout();
        throw new Error('Session expirée');
    }

    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Une erreur est survenue');
    return data;
}

async function handlePlatformLogin(e) {
    e.preventDefault();

    const phone = document.getElementById('platformLoginPhone').value.trim();
    const pin = document.getElementById('platformLoginPin').value.trim();

    try {
        const resp = await fetch(API_BASE + '/api/auth/platform-login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phone, pin })
        });

        const data = await resp.json();
        if (!resp.ok) throw new Error(data.error || 'Erreur de connexion');

        if (!data.member || data.member.role !== 'plateforme') {
            throw new Error('Accès non autorisé - Administrateur plateforme requis');
        }

        // Store platform tokens separately
        localStorage.setItem('platformAccessToken', data.accessToken);
        localStorage.setItem('platformRefreshToken', data.refreshToken);
        localStorage.setItem('platformUserId', data.memberId);

        document.getElementById('platformAdminName').textContent = `${data.member.prenom} ${data.member.name}`;
        showPlatformDashboard();

    } catch (err) {
        console.error(err);
        alert('Erreur de connexion: ' + err.message);
    }
}

function showPlatformDashboard() {
    hideAllSections();
    document.getElementById('platformDashboard').style.display = 'block';
}

function platformLogout() {
    localStorage.removeItem('platformAccessToken');
    localStorage.removeItem('platformRefreshToken');
    localStorage.removeItem('platformUserId');
    hideAllSections();
    document.getElementById('platformLoginSection').style.display = 'block';
}

function showPlatformSetup() {
    hideAllSections();
    document.getElementById('platformSetupSection').style.display = 'block';
}

function showPlatformLogin() {
    hideAllSections();
    document.getElementById('platformLoginSection').style.display = 'block';
}

async function handlePlatformSetup(event) {
    event.preventDefault();
    const body = {
        prenom: document.getElementById('setupPrenom').value.trim(),
        name: document.getElementById('setupNom').value.trim(),
        phone: document.getElementById('setupPhone').value.trim(),
        idNumber: document.getElementById('setupIdNumber').value.trim()
    };

    try {
        const response = await fetch(API_BASE + '/api/platform-admin', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Erreur lors de la création');

        localStorage.setItem('platformAccessToken', data.accessToken);
        localStorage.setItem('platformRefreshToken', data.refreshToken);
        localStorage.setItem('platformUserId', data.memberId);
        document.getElementById('platformAdminName').textContent = `${data.member.prenom} ${data.member.name}`;
        alert(`Administrateur créé. Conservez ce PIN : ${data.pin}`);
        showPlatformDashboard();
    } catch (err) {
        alert('Erreur : ' + err.message);
    }
}

function hideAllSections() {
    const sections = document.querySelectorAll('section');
    sections.forEach(section => section.style.display = 'none');
}

async function showAllGroups() {
    hideAllSections();
    document.getElementById('groupsSection').style.display = 'block';

    try {
        const groups = await apiRequest('/api/groups');
        const container = document.getElementById('allGroupsList');
        container.innerHTML = '<h3>Groupes actifs</h3>';

        if (groups.length === 0) {
            container.innerHTML += '<p>Aucun groupe trouvé</p>';
            return;
        }

        groups.forEach(group => {
            container.innerHTML += `
                <div class="group-item">
                    <h4>${group.name} (${group.country})</h4>
                    <p>Membres: ${Number(group.member_count || 0)}</p>
                    <p>Portefeuille: ${group.wallet || 0} ${group.currency}</p>
                    <p>Créé le: ${new Date(group.created_at).toLocaleDateString()}</p>
                </div>
            `;
        });
    } catch (err) {
        console.error(err);
        document.getElementById('allGroupsList').innerHTML = '<p>Erreur lors du chargement des groupes</p>';
    }
}

function setPlatformConversationComposer(enabled) {
    document.getElementById('platformConversationInput').disabled = !enabled;
    document.getElementById('platformConversationSend').disabled = !enabled;
}

function resetPlatformConversation(message, title = 'Sélectionnez un groupe') {
    selectedPlatformConversationId = '';
    document.getElementById('platformConversationTitle').textContent = title;
    const windowElement = document.getElementById('platformConversationWindow');
    windowElement.replaceChildren();
    const empty = document.createElement('p');
    empty.textContent = message;
    windowElement.appendChild(empty);
    setPlatformConversationComposer(false);
}

function renderPlatformConversationChoices() {
    const search = document.getElementById('platformConversationSearch').value.trim().toLocaleLowerCase('fr-FR');
    const choices = platformConversationGroups.filter(group => {
        const label = `${group.name} ${group.country || ''} ${group.president_prenom || ''} ${group.president_name || ''}`;
        return label.toLocaleLowerCase('fr-FR').includes(search);
    });
    const select = document.getElementById('platformConversationSelect');
    select.replaceChildren();

    if (!platformConversationGroups.length) {
        const option = new Option('Aucun groupe avec président disponible', '');
        option.disabled = true;
        select.appendChild(option);
        resetPlatformConversation('Aucun groupe avec un président n’est disponible pour le moment.', 'Aucune conversation disponible');
        return;
    }
    if (!choices.length) {
        const option = new Option('Aucun résultat pour cette recherche', '');
        option.disabled = true;
        select.appendChild(option);
        resetPlatformConversation('Essayez un autre nom de groupe ou de président.', 'Aucun résultat');
        return;
    }

    choices.forEach(group => {
        const president = `${group.president_prenom || ''} ${group.president_name || ''}`.trim();
        select.appendChild(new Option(`${group.name} — ${president} (${group.country || 'Pays non renseigné'})`, String(group.id)));
    });
    if (selectedPlatformConversationId && choices.some(group => String(group.id) === selectedPlatformConversationId)) {
        select.value = selectedPlatformConversationId;
    } else {
        resetPlatformConversation('Choisissez un groupe pour ouvrir la conversation privée.');
    }
}

function renderPlatformConversationMessages(messages) {
    const windowElement = document.getElementById('platformConversationWindow');
    windowElement.replaceChildren();
    if (!messages.length) {
        const empty = document.createElement('p');
        empty.textContent = 'Aucun message dans cette conversation. Envoyez un premier message au président.';
        windowElement.appendChild(empty);
        return;
    }

    messages.forEach(message => {
        const item = document.createElement('div');
        item.className = 'chat-message';
        const sender = message.role === 'plateforme'
            ? 'Plateforme AVEC'
            : `${message.prenom || 'Président'} ${message.name || ''}`.trim();
        const avatar = document.createElement('span');
        avatar.className = 'chat-avatar';
        avatar.setAttribute('aria-hidden', 'true');
        avatar.textContent = sender.slice(0, 1).toUpperCase();
        const content = document.createElement('div');
        content.className = 'chat-content';
        const name = document.createElement('strong');
        name.textContent = sender;
        const body = document.createElement('p');
        body.textContent = message.message;
        const date = document.createElement('small');
        date.textContent = new Date(message.date).toLocaleString('fr-FR');
        content.append(name, body, date);
        item.append(avatar, content);
        windowElement.appendChild(item);
    });
    windowElement.scrollTop = windowElement.scrollHeight;
}

async function loadPlatformConversation(groupId) {
    setPlatformConversationComposer(false);
    const conversation = await apiRequest(`/api/platform-conversations/${encodeURIComponent(groupId)}`);
    selectedPlatformConversationId = String(conversation.group.id);
    document.getElementById('platformConversationSelect').value = selectedPlatformConversationId;
    document.getElementById('platformConversationTitle').textContent =
        `${conversation.group.name} — ${conversation.president.prenom} ${conversation.president.name}`;
    renderPlatformConversationMessages(conversation.messages);
    setPlatformConversationComposer(true);
}

async function showPlatformMessages() {
    hideAllSections();
    document.getElementById('platformMessagesSection').style.display = 'block';
    document.getElementById('platformConversationSearch').value = '';
    selectedPlatformConversationId = '';
    resetPlatformConversation('Chargement des groupes avec un président…');
    platformConversationGroups = await apiRequest('/api/platform-conversations');
    renderPlatformConversationChoices();
}

async function sendPlatformConversation(event) {
    event.preventDefault();
    if (!selectedPlatformConversationId) return;
    const input = document.getElementById('platformConversationInput');
    await apiRequest(`/api/platform-conversations/${encodeURIComponent(selectedPlatformConversationId)}`, {
        method: 'POST',
        body: JSON.stringify({ message: input.value })
    });
    input.value = '';
    await loadPlatformConversation(selectedPlatformConversationId);
}

async function showAllMembers() {
    hideAllSections();
    document.getElementById('membersSection').style.display = 'block';

    try {
        const members = await apiRequest('/api/members');
        const container = document.getElementById('allMembersList');
        container.innerHTML = '<h3>Tous les membres</h3>';

        if (members.length === 0) {
            container.innerHTML += '<p>Aucun membre trouvé</p>';
            return;
        }

        members.forEach(member => {
            container.innerHTML += `
                <div class="member-item">
                    <h4>${member.prenom} ${member.name}</h4>
                    <p>Téléphone: ${member.phone}</p>
                    <p>Rôle: ${member.role}</p>
                    <p>Groupe: ${member.group_id || 'Aucun'}</p>
                    <button type="button" class="btn btn-warning" onclick="resetMemberPin(${member.id})">Réinitialiser le PIN</button>
                </div>
            `;
        });
    } catch (err) {
        console.error(err);
        document.getElementById('allMembersList').innerHTML = '<p>Erreur lors du chargement des membres</p>';
    }

    async function resetMemberPin(memberId) {
        const pin = window.prompt('Saisissez un nouveau PIN à 4 chiffres :');
        if (pin === null) return;
        if (!/^\d{4}$/.test(pin)) {
            alert('Le PIN doit contenir exactement 4 chiffres.');
            return;
        }

        try {
            await apiRequest(`/api/members/${memberId}/pin`, {
                method: 'PUT',
                body: JSON.stringify({ pin })
            });
            alert('PIN réinitialisé avec succès.');
        } catch (err) {
            alert('Erreur : ' + err.message);
        }
    }

    window.resetMemberPin = resetMemberPin;
}

async function showAlerts() {
    hideAllSections();
    document.getElementById('alertsSection').style.display = 'block';

    try {
        const alerts = await apiRequest('/api/alerts');
        const container = document.getElementById('alertsList');
        container.innerHTML = '<h3>Alertes récentes</h3>';

        if (alerts.length === 0) {
            container.innerHTML += '<p>Aucune alerte</p>';
            return;
        }

        alerts.forEach(alert => {
            container.innerHTML += `
                <div class="alert-item">
                    <h4>${alert.type}</h4>
                    <p>${alert.message}</p>
                    <p>De: ${alert.fromMember}</p>
                    <p>Date: ${new Date(alert.createdAt).toLocaleString()}</p>
                </div>
            `;
        });
    } catch (err) {
        console.error(err);
        document.getElementById('alertsList').innerHTML = '<p>Erreur lors du chargement des alertes</p>';
    }
}

async function showMomoManagement() {
    hideAllSections();
    document.getElementById('momoSection').style.display = 'block';
    await loadMomoAccounts();
}

async function loadMomoAccounts() {
    try {
        const momoAccounts = await apiRequest('/api/momo');
        const container = document.getElementById('momoList');
        container.innerHTML = '<h3>Comptes Momo actifs</h3>';

        if (momoAccounts.length === 0) {
            container.innerHTML += '<p>Aucun compte Momo configuré</p>';
            return;
        }

        momoAccounts.forEach(account => {
            container.innerHTML += `
                <div class="momo-item">
                    <h4>${account.country} — ${account.provider || 'Opérateur non précisé'}</h4>
                    <p>Numéro: ${account.phone_number}</p>
                    <button onclick="deleteMomoAccount(${account.id})" class="btn btn-danger">Supprimer</button>
                </div>
            `;
        });
    } catch (err) {
        console.error(err);
        document.getElementById('momoList').innerHTML = '<p>Erreur lors du chargement des comptes Momo</p>';
    }
}

async function handleAddMomo() {
    const country = document.getElementById('momoCountry').value;
    const provider = document.getElementById('momoProvider').value;
    const phoneInput = document.getElementById('momoPhone');
    const localNumber = phoneInput.value.trim();
    const dialCode = phoneInput.dataset.dialCode;

    if (!country || !provider || !dialCode || !localNumber || !/^[+()\s.\d-]+$/.test(localNumber)) {
        alert('Veuillez sélectionner le pays et l’opérateur, puis saisir un numéro valide.');
        return;
    }
    const digits = localNumber.replace(/\D/g, '');
    const phone = localNumber.startsWith('+')
        ? localNumber
        : `${dialCode}${digits.startsWith(dialCode.slice(1)) ? digits.slice(dialCode.length - 1) : digits.replace(/^0+/, '')}`;

    try {
        await apiRequest('/api/momo', {
            method: 'POST',
            body: JSON.stringify({ country, provider, phone })
        });

        alert('Compte Momo ajouté avec succès');
        document.getElementById('momoCountry').value = '';
        document.getElementById('momoProvider').value = '';
        document.getElementById('momoPhone').value = '';
        updateMomoFields();
        await loadMomoAccounts();
    } catch (err) {
        console.error(err);
        alert('Erreur lors de l\'ajout du compte Momo: ' + err.message);
    }
}

async function deleteMomoAccount(id) {
    if (!confirm('Êtes-vous sûr de vouloir supprimer ce compte Momo ?')) return;

    try {
        await apiRequest('/api/momo/' + id, { method: 'DELETE' });
        alert('Compte Momo supprimé');
        await loadMomoAccounts();
    } catch (err) {
        console.error(err);
        alert('Erreur lors de la suppression: ' + err.message);
    }
}

function reviewRequestItem(request) {
    const item = document.createElement('article');
    item.className = 'alert-item';
    const title = document.createElement('h3');
    title.textContent = `${request.group_name} (${request.country})`;
    const status = document.createElement('p');
    status.textContent = request.blocked ? 'Statut : bloqué' : 'Statut : actif';
    const from = document.createElement('p');
    from.textContent = `Président : ${request.requester_prenom} ${request.requester_name}`;
    const message = document.createElement('p');
    message.textContent = `Demande : ${request.message}`;
    const date = document.createElement('p');
    date.textContent = `Reçue le : ${new Date(request.created_at).toLocaleString('fr-FR')}`;
    item.append(title, status, from, message, date);
    if (request.status === 'pending' && request.blocked) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'btn btn-success';
        button.textContent = 'Réactiver le groupe';
        button.addEventListener('click', () => reactivateGroup(request.group_id));
        item.appendChild(button);
    } else {
        const resolved = document.createElement('p');
        resolved.textContent = 'Demande traitée.';
        item.appendChild(resolved);
    }
    return item;
}

async function showReviewRequests() {
    hideAllSections();
    document.getElementById('reviewRequestsSection').style.display = 'block';
    const container = document.getElementById('reviewRequestsList');
    container.replaceChildren();
    try {
        const [blockedGroups, requests] = await Promise.all([
            apiRequest('/api/blocked-groups'),
            apiRequest('/api/review-requests')
        ]);
        if (!blockedGroups.length && !requests.length) {
            const empty = document.createElement('p');
            empty.textContent = 'Aucun groupe bloqué ni demande de révision pour le moment.';
            container.appendChild(empty);
            return;
        }
        blockedGroups.forEach(group => {
            const item = document.createElement('article');
            item.className = 'alert-item';
            const title = document.createElement('h3');
            title.textContent = `${group.name} (${group.country}) — bloqué`;
            const provider = document.createElement('p');
            provider.textContent = `Portefeuille : ${group.momo_provider || 'non précisé'} · ${group.phone || 'non renseigné'}`;
            const details = document.createElement('p');
            details.textContent = `Dernier signalement : ${group.latest_fraud_details || 'Consultez l’historique du groupe.'}`;
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'btn btn-success';
            button.textContent = 'Réactiver le groupe';
            button.addEventListener('click', () => reactivateGroup(group.id));
            item.append(title, provider, details, button);
            container.appendChild(item);
        });
        requests.forEach(request => container.appendChild(reviewRequestItem(request)));
    } catch (err) {
        console.error(err);
        const error = document.createElement('p');
        error.textContent = 'Erreur lors du chargement des demandes de révision.';
        container.appendChild(error);
    }
}

async function reactivateGroup(groupId) {
    if (!window.confirm('Réactiver ce groupe ? Tous ses membres recevront une notification.')) return;
    try {
        await apiRequest(`/api/groups/${encodeURIComponent(groupId)}/reactivate`, { method: 'POST', body: '{}' });
        await showReviewRequests();
    } catch (err) {
        alert(`Erreur lors de la réactivation : ${err.message}`);
    }
}

async function showPlatformStats() {
    hideAllSections();
    document.getElementById('platformStatsSection').style.display = 'block';

    try {
        const stats = await apiRequest('/api/stats/platform');
        const container = document.getElementById('platformStats');
        container.innerHTML = `
            <h3>Statistiques globales</h3>
            <div class="stats">
                <div class="stat-item">Total groupes: ${stats.totalGroups}</div>
                <div class="stat-item">Total membres: ${stats.totalMembers}</div>
                <div class="stat-item">Portefeuille total: ${stats.totalWallet} XOF</div>
                <div class="stat-item">Crédits actifs: ${stats.activeCredits}</div>
                <div class="stat-item">Alertes actives: ${stats.activeAlerts}</div>
            </div>
        `;
    } catch (err) {
        console.error(err);
        document.getElementById('platformStats').innerHTML = '<p>Erreur lors du chargement des statistiques</p>';
    }
}

function paymentLedgerItem(payment) {
    const item = document.createElement('article');
    item.className = 'momo-item';
    const title = document.createElement('h4');
    title.textContent = `${payment.transaction_type} — ${payment.status}`;
    const details = document.createElement('p');
    details.textContent = `${payment.amount_minor} ${payment.currency} · ${payment.provider} · ${new Date(payment.created_at).toLocaleString('fr-FR')}`;
    const id = document.createElement('p');
    id.textContent = `ID paiement : ${payment.transaction_id}`;
    const reference = document.createElement('p');
    reference.textContent = `Référence SANDBOX : ${payment.external_reference || 'en attente'}`;
    item.append(title, details, id, reference);
    return item;
}

async function showPaymentLedger() {
    hideAllSections();
    document.getElementById('paymentLedgerSection').style.display = 'block';
    const ledger = document.getElementById('paymentLedgerList');
    const operations = document.getElementById('paymentOperationsList');
    ledger.replaceChildren();
    operations.replaceChildren();
    try {
        const [paymentData, operationData] = await Promise.all([
            apiRequest('/api/payments'),
            apiRequest('/api/payment-operations')
        ]);
        const ledgerTitle = document.createElement('h3');
        ledgerTitle.textContent = 'Écritures de paiement';
        ledger.appendChild(ledgerTitle);
        if (!paymentData.payments.length) {
            const empty = document.createElement('p');
            empty.textContent = 'Aucune écriture SANDBOX.';
            ledger.appendChild(empty);
        } else {
            paymentData.payments.forEach(payment => ledger.appendChild(paymentLedgerItem(payment)));
        }

        async function showSocialModeration() {
            const content = document.getElementById('platformContent');
            content.replaceChildren();
            const title = document.createElement('h3');
            title.textContent = 'Signalements de publications';
            const note = document.createElement('p');
            note.textContent = 'Cette vue ne contient jamais de messages privés.';
            content.append(title, note);
            const data = await apiRequest('/api/admin/social/reports');
            if (!data.reports.length) {
                const empty = document.createElement('p');
                empty.textContent = 'Aucun signalement ouvert.';
                content.appendChild(empty);
                return;
            }
            data.reports.forEach(report => {
                const item = document.createElement('article');
                item.className = 'momo-item';
                const body = document.createElement('p');
                body.textContent = `${report.prenom} ${report.name} : ${report.body}`;
                const reason = document.createElement('p');
                reason.textContent = `Signalement : ${report.reason}`;
                const remove = document.createElement('button');
                remove.className = 'btn btn-danger';
                remove.type = 'button';
                remove.textContent = 'Retirer la publication';
                remove.addEventListener('click', async () => {
                    await apiRequest(`/api/admin/social/posts/${encodeURIComponent(report.post_id)}`, { method: 'DELETE' });
                    await showSocialModeration();
                });
                const resolve = document.createElement('button');
                resolve.className = 'btn btn-secondary';
                resolve.type = 'button';
                resolve.textContent = 'Classer le signalement';
                resolve.addEventListener('click', async () => {
                    await apiRequest(`/api/admin/social/reports/${encodeURIComponent(report.id)}`, { method: 'PUT' });
                    await showSocialModeration();
                });
                item.append(body, reason, remove, resolve);
                content.appendChild(item);
            });
        }
        const operationsTitle = document.createElement('h3');
        operationsTitle.textContent = 'Opérations de prêt';
        operations.appendChild(operationsTitle);
        if (!operationData.operations.length) {
            const empty = document.createElement('p');
            empty.textContent = 'Aucune opération de prêt.';
            operations.appendChild(empty);
        } else {
            operationData.operations.forEach(operation => {
                const item = document.createElement('article');
                item.className = 'momo-item';
                item.textContent = `${operation.operation_type} · ${operation.status} · ${operation.amount_minor} ${operation.currency} · ID : ${operation.operation_id}`;
                operations.appendChild(item);
            });
        }
    } catch (err) {
        console.error(err);
        ledger.textContent = 'Erreur lors du chargement du registre de paiements.';
    }
}

const DEPLOYMENT_PROVIDER_LABELS = {
    self_hosted: 'Auto-hébergé', render: 'Render', railway: 'Railway', fly_io: 'Fly.io', heroku: 'Heroku',
    other: 'Autre fournisseur', sandbox: 'SANDBOX (aucun envoi réel)', twilio: 'Twilio',
    africastalking: 'Africa’s Talking', infobip: 'Infobip', none: 'Aucun fournisseur vidéo',
    jitsi: 'Jitsi', livekit: 'LiveKit', agora: 'Agora'
};

function deploymentLines(value) {
    return value.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
}

function populateDeploymentSelect(id, values, selected) {
    const select = document.getElementById(id);
    select.replaceChildren();
    values.forEach(value => select.add(new Option(DEPLOYMENT_PROVIDER_LABELS[value] || value, value, false, value === selected)));
}

function renderDeploymentReadiness(data) {
    const container = document.getElementById('deploymentReadiness');
    container.replaceChildren();
    const title = document.createElement('h3');
    title.textContent = 'État de préparation';
    const summary = document.createElement('p');
    summary.textContent = `${data.readinessSummary.completed} contrôles sur ${data.readinessSummary.total} sont prêts. Les statuts indiquent uniquement la présence des variables, jamais leur valeur.`;
    const checks = document.createElement('ul');
    checks.className = 'deployment-status-list';
    const labels = {
        httpsReady: 'HTTPS et URL publique', domainReady: 'Domaine et origines frontend HTTPS',
        backupVerified: 'Sauvegarde restaurable confirmée', productionDeclared: 'Checklist de production confirmée',
        sandboxAcknowledged: 'Avertissement SANDBOX confirmé', secretsConfigured: 'Variables d’environnement requises'
    };
    Object.entries(data.readiness).forEach(([key, ready]) => {
        const item = document.createElement('li');
        item.className = ready ? 'is-ready' : 'is-missing';
        item.textContent = `${ready ? 'Prêt' : 'À compléter'} — ${labels[key]}`;
        checks.appendChild(item);
    });
    const environmentTitle = document.createElement('h4');
    environmentTitle.textContent = 'Variables d’environnement à configurer chez l’hébergeur';
    const environment = document.createElement('ul');
    environment.className = 'deployment-status-list';
    data.environment.forEach(item => {
        const row = document.createElement('li');
        row.className = item.configured ? 'is-ready' : 'is-missing';
        row.textContent = `${item.configured ? 'Présente' : 'Manquante'} — ${item.label}`;
        environment.appendChild(row);
    });
    container.append(title, summary, checks, environmentTitle, environment);
}

function renderDeploymentHistory(entries) {
    const container = document.getElementById('deploymentHistory');
    container.replaceChildren();
    if (!entries.length) {
        container.textContent = 'Aucune modification enregistrée.';
        return;
    }
    const list = document.createElement('ul');
    list.className = 'deployment-history-list';
    entries.forEach(entry => {
        const item = document.createElement('li');
        item.textContent = `${new Date(entry.createdAt).toLocaleString('fr-FR')} — ${entry.actor} a mis à jour les paramètres non secrets.`;
        list.appendChild(item);
    });
    container.appendChild(list);
}

function populateDeploymentForm(data) {
    const settings = data.settings;
    document.getElementById('deploymentPublicBaseUrl').value = settings.publicBaseUrl;
    document.getElementById('deploymentAllowedOrigins').value = settings.allowedOrigins.join('\n');
    document.getElementById('deploymentTurnUrls').value = settings.turnUrls.join('\n');
    populateDeploymentSelect('deploymentHostingProvider', data.providerLabels.hosting, settings.hostingProvider);
    populateDeploymentSelect('deploymentSmsProvider', data.providerLabels.sms, settings.smsProvider);
    populateDeploymentSelect('deploymentVideoProvider', data.providerLabels.video, settings.videoProvider);
    ['MaintenanceMode', 'BackupVerified', 'SandboxAcknowledged', 'ProductionReady'].forEach(key => {
        document.getElementById(`deployment${key}`).checked = settings[key.charAt(0).toLowerCase() + key.slice(1)];
    });
    const momo = document.getElementById('deploymentMomoProviders');
    momo.replaceChildren();
    Object.entries(data.providerLabels.momo).forEach(([provider, label]) => {
        const wrapper = document.createElement('label');
        wrapper.className = 'deployment-check';
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.name = 'deploymentMomoProvider';
        checkbox.value = provider;
        checkbox.checked = settings.momoProviders.includes(provider);
        wrapper.append(checkbox, ` ${label}`);
        momo.appendChild(wrapper);
    });
}

async function showDeploymentSettings() {
    hideAllSections();
    document.getElementById('deploymentSettingsSection').style.display = 'block';
    document.getElementById('deploymentSaveMessage').textContent = '';
    const [data, history] = await Promise.all([
        apiRequest('/api/admin/deployment-settings'),
        apiRequest('/api/admin/deployment-settings/history')
    ]);
    populateDeploymentForm(data);
    renderDeploymentReadiness(data);
    renderDeploymentHistory(history);
}

async function saveDeploymentSettings(event) {
    event.preventDefault();
    const message = document.getElementById('deploymentSaveMessage');
    const form = event.currentTarget;
    const button = form.querySelector('button[type="submit"]');
    const body = {
        publicBaseUrl: document.getElementById('deploymentPublicBaseUrl').value.trim(),
        allowedOrigins: deploymentLines(document.getElementById('deploymentAllowedOrigins').value),
        hostingProvider: document.getElementById('deploymentHostingProvider').value,
        smsProvider: document.getElementById('deploymentSmsProvider').value,
        videoProvider: document.getElementById('deploymentVideoProvider').value,
        turnUrls: deploymentLines(document.getElementById('deploymentTurnUrls').value),
        momoProviders: Array.from(document.querySelectorAll('input[name="deploymentMomoProvider"]:checked'), input => input.value),
        maintenanceMode: document.getElementById('deploymentMaintenanceMode').checked,
        backupVerified: document.getElementById('deploymentBackupVerified').checked,
        sandboxAcknowledged: document.getElementById('deploymentSandboxAcknowledged').checked,
        productionReady: document.getElementById('deploymentProductionReady').checked
    };
    button.disabled = true;
    message.textContent = '';
    try {
        const data = await apiRequest('/api/admin/deployment-settings', { method: 'PUT', body: JSON.stringify(body) });
        populateDeploymentForm(data);
        renderDeploymentReadiness(data);
        renderDeploymentHistory(await apiRequest('/api/admin/deployment-settings/history'));
        message.textContent = 'Paramètres non secrets enregistrés et historisés.';
    } catch (error) {
        message.textContent = error.message;
    } finally {
        button.disabled = false;
    }
}