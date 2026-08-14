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
    group$('showGroupAdminDashboard').hidden = !isGroupStaff();
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

function renderMovements(items, title) {
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
                row.textContent = `${entry.action} · ${new Date(entry.date).toLocaleDateString('fr-FR')}`;
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
    renderMovements(entries, groupRegister ? 'Registre du groupe AVEC' : 'Mon registre de mouvements');
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
    group$('showCreditRequests').addEventListener('click', () => loadCreditRequests().catch(error => { group$('groupStatus').textContent = error.message; }));
    group$('showGroupSettings').addEventListener('click', () => { group$('groupSettingsSection').hidden = !group$('groupSettingsSection').hidden; });
    group$('groupSettingsForm').addEventListener('submit', async event => {
        event.preventDefault();
        await groupRequest(`/api/groups/${groupId}`, { method: 'PUT', body: JSON.stringify({ cycle_length: Number(group$('cycleLength').value) }) });
        group$('groupStatus').textContent = 'Règles du cycle enregistrées.';
        await loadGroup();
    });
    group$('closeCycle').addEventListener('click', async () => {
        await groupRequest(`/api/groups/${groupId}/cycle/close`, { method: 'POST', body: '{}' });
        group$('groupStatus').textContent = 'Cycle clôturé.';
    });
    group$('distributeCycle').addEventListener('click', async () => {
        await groupRequest(`/api/groups/${groupId}/cycle/distribute`, { method: 'POST', body: '{}' });
        group$('groupStatus').textContent = 'Partage du cycle effectué.';
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
