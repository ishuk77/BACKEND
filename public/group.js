const groupApi = window.location.origin;
const group$ = id => document.getElementById(id);
let groupMember;
let groupId;
let activeAction;
const groupActionConfig = {
    contribution: { label: 'Contribuer depuis mon wallet', endpoint: 'contributions' },
    credit: { label: 'Demander un crédit', endpoint: 'credit-request', reason: 'Motif de la demande' },
    repayment: { label: 'Rembourser mon crédit', endpoint: 'repayments' },
    withdrawal: { label: 'Retirer', endpoint: 'withdrawals' },
    fraud: { label: 'Signaler une fraude', endpoint: 'fraud-reports', reason: 'Décrivez le signalement', amount: false }
};
async function groupRequest(path, options = {}) {
    const token = localStorage.getItem('accessToken');
    if (!token) throw new Error('Session du groupe requise.');
    const response = await fetch(`${groupApi}${path}`, { ...options, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(options.headers || {}) } });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Opération impossible.');
    return data;
}
async function loadGroup() {
    const memberId = localStorage.getItem('userId');
    groupMember = await groupRequest(`/api/members/${encodeURIComponent(memberId)}`);
    groupId = groupMember.group_id;
    const data = await groupRequest(`/api/groups/${encodeURIComponent(groupId)}`);
    const group = data.group;
    groupMember = data.members.find(member => String(member.id) === String(memberId)) || groupMember;
    group$('groupTitle').textContent = group.name;
    group$('groupStatus').textContent = `${group.country} · Tableau de bord réservé aux membres de cette AVEC.`;
    group$('memberWallet').textContent = Number(groupMember.wallet || 0);
    group$('groupWallet').textContent = Number(group.wallet || 0);
    group$('groupRole').textContent = groupMember.role;
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
    const body = config.amount === false ? { details: group$('actionReason').value.trim() } : { amount: Number(group$('actionAmount').value), ...(config.reason ? { reason: group$('actionReason').value.trim() } : {}) };
    await groupRequest(`/api/members/${groupMember.id}/${config.endpoint}`, { method: 'POST', body: JSON.stringify(body) });
    group$('actionSection').hidden = true;
    await loadGroup();
}
async function loadMovements() {
    const data = await groupRequest('/api/history');
    const groups = new Map();
    data.forEach(item => {
        const month = new Date(item.date).toLocaleDateString('fr-FR', { year: 'numeric', month: 'long' });
        const items = groups.get(month) || [];
        items.push(item);
        groups.set(month, items);
    });
    group$('movementList').innerHTML = [...groups].map(([month, entries]) => `<section><h3>${month}</h3>${entries.map(entry => `<p>${entry.action} · ${new Date(entry.date).toLocaleDateString('fr-FR')}</p>`).join('')}</section>`).join('') || '<p>Aucun mouvement.</p>';
    group$('movementSection').hidden = false;
}
async function loadChat() {
    const data = await groupRequest(`/api/chat/${groupId}`);
    group$('groupChat').innerHTML = data.messages.map(message => `<p><strong>${message.prenom || 'Membre'}</strong> : ${message.message}</p>`).join('') || '<p>Aucun message.</p>';
    group$('chatSection').hidden = false;
}
document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('[data-action]').forEach(button => button.addEventListener('click', () => openAction(button.dataset.action)));
    group$('actionForm').addEventListener('submit', event => submitAction(event).catch(error => { group$('groupStatus').textContent = error.message; }));
    group$('showMovements').addEventListener('click', () => loadMovements().catch(error => { group$('groupStatus').textContent = error.message; }));
    group$('showChat').addEventListener('click', () => loadChat().catch(error => { group$('groupStatus').textContent = error.message; }));
    group$('groupChatForm').addEventListener('submit', async event => {
        event.preventDefault();
        await groupRequest('/api/chat', { method: 'POST', body: JSON.stringify({ group_id: groupId, message: group$('groupMessage').value.trim() }) });
        group$('groupMessage').value = '';
        loadChat();
    });
    group$('groupLogout').addEventListener('click', () => {
        ['accessToken', 'refreshToken', 'groupId', 'userId'].forEach(key => localStorage.removeItem(key));
        window.location.assign('platform.html');
    });
    loadGroup().catch(error => { group$('groupStatus').textContent = error.message; });
});
