const groupApi = window.location.origin;
const group$ = id => document.getElementById(id);
let groupMember;
let groupId;
let groupData;
let groupMembers = [];
let activeAction;
const GROUP_STAFF_ROLES = ['president', 'vice_president', 'comptable'];
const groupActionConfig = {
    contribution: { label: 'Contribuer depuis mon wallet personnel AVEC', endpoint: 'contributions' },
    credit: { label: 'Demander un crédit', endpoint: 'credit-request', reason: 'Motif de la demande' },
    repayment: { label: 'Rembourser depuis mon wallet personnel AVEC', endpoint: 'repayments' },
    withdrawal: { label: 'Retirer vers Momo', endpoint: 'withdrawals' },
    fraud: { label: 'Alerter directement la plateforme', endpoint: 'fraud-reports', reason: 'Décrivez le signalement', amount: false }
};

async function groupRequest(path, options = {}) {
    const token = localStorage.getItem('accessToken');
    if (!token) throw new Error('Session du groupe requise.');
    const response = await fetch(`${groupApi}${path}`, { ...options, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(options.headers || {}) } });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Opération impossible.');
    return data;
}

function formatMoney(value) {
    return `${Number(value || 0).toFixed(2).replace('.', ',')} USD`;
}

function isGroupStaff() {
    return GROUP_STAFF_ROLES.includes(groupMember.role);
}

function setDashboard(name) {
    const member = name === 'member';
    group$('memberDashboard').hidden = !member;
    group$('groupAdminDashboard').hidden = member;
    group$('showMemberDashboard').className = `btn ${member ? 'btn-primary' : 'btn-secondary'}`;
    group$('showGroupAdminDashboard').className = `btn ${member ? 'btn-secondary' : 'btn-primary'}`;
}

async function loadGroup() {
    const memberId = localStorage.getItem('userId');
    groupMember = await groupRequest(`/api/members/${encodeURIComponent(memberId)}`);
    groupId = groupMember.group_id;
    const data = await groupRequest(`/api/groups/${encodeURIComponent(groupId)}`);
    groupData = data.group;
    groupMembers = data.members || [];
    groupMember = groupMembers.find(member => String(member.id) === String(memberId)) || groupMember;
    const groupName = groupData.name;
    group$('groupTitle').textContent = groupName;
    group$('groupStatus').textContent = `${groupData.country} · Espace membre AVEC.`;
    ['memberGroupName', 'memberGroupWalletName', 'adminGroupName', 'adminGroupWalletName'].forEach(id => { group$(id).textContent = groupName; });
    group$('memberWallet').textContent = formatMoney(groupMember.wallet);
    group$('memberGroupWallet').textContent = formatMoney(groupData.wallet);
    group$('groupWallet').textContent = formatMoney(groupData.wallet);
    group$('memberRole').textContent = groupMember.role;
    group$('groupRole').textContent = `Rôle : ${groupMember.role}`;
    group$('cycleLength').value = groupData.cycle_length || 6;
    group$('cycleState').textContent = `Cycle ${groupData.cycle_number || 1} : ${groupData.cycle_status || 'open'}.`;
    const isEpargne = groupData.group_type === 'Epargne';
    group$('epargneSettings').hidden = !isEpargne;
    group$('creditAction').hidden = isEpargne;
    group$('repaymentAction').hidden = isEpargne;
    if (isEpargne) {
        group$('groupSavingsPeriodicity').value = groupData.savings_periodicity || 'weekly';
        group$('groupSavingsPeriod').value = groupData.savings_period || 1;
    }
    group$('restoreCycle').hidden = groupData.cycle_status !== 'closed';
    group$('newCycle').hidden = groupData.cycle_status !== 'closed';
    group$('lockBeneficiaryOrder').hidden = !isEpargne || groupData.cycle_status !== 'planning';
    group$('showGroupAdminDashboard').hidden = !isGroupStaff();
    if (isGroupStaff()) {
        loadJoinRequests().catch(error => { group$('groupStatus').textContent = error.message; });
    }
}

function openAction(action) {
    activeAction = action;
    const config = groupActionConfig[action];
    group$('actionTitle').textContent = config.label;
    group$('actionSection').hidden = false;
    group$('actionForm').reset();
    group$('amountField').hidden = config.amount === false;
    group$('actionAmount').required = config.amount !== false;
    group$('reasonField').hidden = !config.reason;
    group$('actionReason').required = Boolean(config.reason);
    group$('actionReason').previousElementSibling.textContent = config.reason || '';
}

async function submitAction(event) {
    event.preventDefault();
    const config = groupActionConfig[activeAction];
    const body = config.amount === false
        ? { details: group$('actionReason').value.trim() }
        : { amount: Number(group$('actionAmount').value), ...(config.reason ? { reason: group$('actionReason').value.trim() } : {}) };
    await groupRequest(`/api/members/${groupMember.id}/${config.endpoint}`, { method: 'POST', body: JSON.stringify(body) });
    group$('actionSection').hidden = true;
    group$('groupStatus').textContent = activeAction === 'fraud'
        ? 'Alerte envoyée directement à la plateforme.'
        : 'Opération enregistrée.';
    await loadGroup();
}

async function fundMemberWallet(event) {
    event.preventDefault();
    const amount = Number(group$('memberWalletFundingAmount').value);
    await groupRequest(`/api/members/${groupMember.id}/fund-from-platform-wallet`, { method: 'POST', body: JSON.stringify({ amount }) });
    group$('memberWalletFundingForm').reset();
    group$('groupStatus').textContent = 'Votre wallet personnel AVEC a été alimenté depuis votre wallet plateforme.';
    await loadGroup();
}

function renderMovements(items, title, includeMemberNames = false) {
    const groups = new Map();
    items.forEach(item => {
        const month = new Date(item.date).toLocaleDateString('fr-FR', { year: 'numeric', month: 'long' });
        const entries = groups.get(month) || [];
        entries.push(item);
        groups.set(month, entries);
    });
    group$('movementTitle').textContent = title;
    group$('movementList').replaceChildren();
    if (!groups.size) {
        group$('movementList').textContent = 'Aucun mouvement.';
    } else {
        for (const [month, entries] of groups) {
            const section = document.createElement('section');
            const heading = document.createElement('h3');
            heading.textContent = month;
            section.appendChild(heading);
            entries.forEach(entry => {
                const row = document.createElement('p');
                const memberName = includeMemberNames
                    ? [entry.prenom, entry.name].filter(Boolean).join(' ')
                    : '';
                const member = memberName ? ` · ${memberName}` : '';
                row.textContent = `${entry.action}${member} · ${new Date(entry.date).toLocaleDateString('fr-FR')}`;
                section.appendChild(row);
            });
            group$('movementList').appendChild(section);
        }
    }
    group$('movementSection').hidden = false;
}

async function loadMovements(groupRegister = false) {
    const data = await groupRequest('/api/history');
    const entries = groupRegister ? data : data.filter(item => String(item.member_id) === String(groupMember.id));
    renderMovements(entries, groupRegister ? 'Registre du groupe AVEC' : 'Mon registre de mouvements', groupRegister);
}

async function loadCreditRequests() {
    const requests = groupMembers.filter(member => member.credit_request);
    group$('creditRequestsList').replaceChildren();
    requests.forEach(member => {
        const row = document.createElement('p');
        row.textContent = `${member.prenom} ${member.name} : ${member.credit_request}`;
        group$('creditRequestsList').appendChild(row);
    });
    if (!requests.length) group$('creditRequestsList').textContent = 'Aucune demande de crédit en attente.';
    group$('creditRequestsSection').hidden = false;
}

async function loadJoinRequests() {
    const data = await groupRequest(`/api/groups/${groupId}/join-requests`);
    const list = group$('joinRequestsList');
    list.replaceChildren();
    const pending = data.requests.filter(request => request.status === 'pending');
    pending.forEach(request => {
        const row = document.createElement('div');
        row.className = 'member-item';
        const details = document.createElement('span');
        details.textContent = `${request.prenom} ${request.name} · ${request.identifier}${request.note ? ` · ${request.note}` : ''}`;
        row.appendChild(details);
        const existingGroups = String(request.existing_group_names || '').trim();
        const outstandingCredit = Number(request.outstanding_credit || 0);
        if (existingGroups) {
            const warning = document.createElement('p');
            warning.className = 'field-hint';
            warning.textContent = `Déjà membre de : ${existingGroups}. Président(s) à contacter : ${request.existing_group_presidents || 'coordonnées indisponibles'}.${outstandingCredit > 0 ? ` Crédit restant : ${outstandingCredit.toFixed(2)} USD.` : ''}`;
            row.appendChild(warning);
        }
        ['Accepter', 'Refuser'].forEach((label, index) => {
            const button = document.createElement('button');
            button.className = `btn ${index ? 'btn-danger' : 'btn-primary'}`;
            button.type = 'button';
            button.textContent = label;
            if (!index && outstandingCredit > 0) {
                button.disabled = true;
                button.title = 'L’acceptation est bloquée tant que le crédit de l’autre groupe n’est pas remboursé.';
            }
            button.addEventListener('click', async () => {
                button.disabled = true;
                try {
                    await groupRequest(`/api/groups/${groupId}/join-requests/${request.id}`, {
                        method: 'PUT',
                        body: JSON.stringify({ status: index ? 'rejected' : 'approved' })
                    });
                    group$('groupStatus').textContent = index
                        ? `Demande de ${request.prenom} refusée.`
                        : `${request.prenom} est maintenant membre du groupe.`;
                    await loadJoinRequests();
                    await loadGroup();
                } catch (error) {
                    group$('groupStatus').textContent = error.message;
                    button.disabled = false;
                }
            });
            row.appendChild(button);
        });
        list.appendChild(row);
    });
    if (!pending.length) list.textContent = 'Aucune demande d’adhésion en attente.';
    group$('joinRequestsSection').hidden = false;
}

async function loadChat() {
    const data = await groupRequest(`/api/chat/${groupId}`);
    group$('groupChat').replaceChildren();
    data.messages.forEach(message => {
        const row = document.createElement('p');
        const author = document.createElement('strong');
        author.textContent = message.prenom || 'Membre';
        row.append(author, ` : ${message.message}`);
        group$('groupChat').appendChild(row);
    });
    if (!data.messages.length) group$('groupChat').textContent = 'Aucun message.';
    group$('chatSection').hidden = false;
}

document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('[data-action]').forEach(button => button.addEventListener('click', () => openAction(button.dataset.action)));
    group$('showMemberDashboard').addEventListener('click', () => setDashboard('member'));
    group$('showGroupAdminDashboard').addEventListener('click', () => setDashboard('admin'));
    group$('memberWalletFundingForm').addEventListener('submit', event => fundMemberWallet(event).catch(error => { group$('groupStatus').textContent = error.message; }));
    group$('actionForm').addEventListener('submit', event => submitAction(event).catch(error => { group$('groupStatus').textContent = error.message; }));
    group$('showMemberMovements').addEventListener('click', () => loadMovements().catch(error => { group$('groupStatus').textContent = error.message; }));
    group$('showGroupMovements').addEventListener('click', () => loadMovements(true).catch(error => { group$('groupStatus').textContent = error.message; }));
    group$('showFraudReport').addEventListener('click', () => openAction('fraud'));
    group$('showChat').addEventListener('click', () => loadChat().catch(error => { group$('groupStatus').textContent = error.message; }));
    group$('showJoinRequests').addEventListener('click', () => loadJoinRequests().catch(error => { group$('groupStatus').textContent = error.message; }));
    group$('showCreditRequests').addEventListener('click', () => loadCreditRequests().catch(error => { group$('groupStatus').textContent = error.message; }));
    group$('showGroupSettings').addEventListener('click', () => { group$('groupSettingsSection').hidden = !group$('groupSettingsSection').hidden; });
    group$('groupSettingsForm').addEventListener('submit', async event => {
        event.preventDefault();
        const settings = { cycle_length: Number(group$('cycleLength').value) };
        if (groupData.group_type === 'Epargne') {
            settings.savings_periodicity = group$('groupSavingsPeriodicity').value;
            settings.savings_period = Number(group$('groupSavingsPeriod').value);
        }
        await groupRequest(`/api/groups/${groupId}`, { method: 'PUT', body: JSON.stringify(settings) });
        group$('groupStatus').textContent = 'Règles du cycle enregistrées.';
        await loadGroup();
    });
    group$('closeCycle').addEventListener('click', async () => {
        if (!window.confirm('Confirmez-vous la clôture du cycle ? Les opérations financières seront bloquées jusqu’au nouveau cycle ou à une restauration par le personnel.')) return;
        await groupRequest(`/api/groups/${groupId}/cycle/close`, { method: 'POST', body: JSON.stringify({ confirmed: true }) });
        group$('groupStatus').textContent = 'Cycle clôturé après confirmation.';
        await loadGroup();
    });
    group$('distributeCycle').addEventListener('click', async () => {
        await groupRequest(`/api/groups/${groupId}/cycle/distribute`, { method: 'POST', body: '{}' });
        group$('groupStatus').textContent = 'Partage du cycle effectué.';
        await loadGroup();
    });
    group$('restoreCycle').addEventListener('click', async () => {
        if (!window.confirm('Restaurer ce cycle clôturé par erreur ?')) return;
        await groupRequest(`/api/groups/${groupId}/cycle/restore`, { method: 'POST', body: '{}' });
        group$('groupStatus').textContent = 'Cycle restauré.';
        await loadGroup();
    });
    group$('newCycle').addEventListener('click', async () => {
        await groupRequest(`/api/groups/${groupId}/cycle/new`, { method: 'POST', body: '{}' });
        group$('groupStatus').textContent = 'Nouveau cycle créé.';
        await loadGroup();
    });
    group$('lockBeneficiaryOrder').addEventListener('click', async () => {
        const memberIds = groupMembers.map(member => Number(member.id));
        if (!window.confirm(`Verrouiller l’ordre automatique des ${memberIds.length} bénéficiaires avant le début du cycle ?`)) return;
        await groupRequest(`/api/groups/${groupId}/cycle/beneficiary-order`, { method: 'PUT', body: JSON.stringify({ member_ids: memberIds }) });
        group$('groupStatus').textContent = 'Ordre automatique des bénéficiaires verrouillé.';
        await loadGroup();
    });
    group$('groupChatForm').addEventListener('submit', async event => {
        event.preventDefault();
        await groupRequest('/api/chat', { method: 'POST', body: JSON.stringify({ group_id: groupId, message: group$('groupMessage').value.trim() }) });
        group$('groupMessage').value = '';
        await loadChat();
    });
    group$('groupLogout').addEventListener('click', () => {
        ['accessToken', 'refreshToken', 'groupId', 'userId'].forEach(key => localStorage.removeItem(key));
        window.location.assign('platform.html');
    });
    loadGroup().catch(error => { group$('groupStatus').textContent = error.message; });
});
