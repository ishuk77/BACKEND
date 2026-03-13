// === Administration Plateforme AVEC ===

// For production, change this to your deployed server URL
const API_BASE = window.location.hostname === 'localhost' ? 'http://localhost:3000' : 'https://your-server.com';

document.addEventListener('DOMContentLoaded', function() {
    // Platform login
    document.getElementById('platformLoginForm').addEventListener('submit', handlePlatformLogin);

    // Admin actions
    document.getElementById('btnViewAllGroups').addEventListener('click', showAllGroups);
    document.getElementById('btnViewAllMembers').addEventListener('click', showAllMembers);
    document.getElementById('btnViewAlerts').addEventListener('click', showAlerts);
    document.getElementById('btnManageMomo').addEventListener('click', showMomoManagement);
    document.getElementById('btnPlatformStats').addEventListener('click', showPlatformStats);

    // Momo management
    document.getElementById('btnAddMomo').addEventListener('click', handleAddMomo);

    // Check if platform admin is already logged in
    const token = localStorage.getItem('platformAccessToken');
    if (token) {
        showPlatformDashboard();
    }
});

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

    return res.json();
}

async function handlePlatformLogin(e) {
    e.preventDefault();

    const phone = document.getElementById('platformLoginPhone').value.trim();
    const pin = document.getElementById('platformLoginPin').value.trim();

    try {
        const resp = await fetch(API_BASE + '/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phone, pin })
        });

        const data = await resp.json();
        if (!resp.ok) throw new Error(data.error || 'Erreur de connexion');

        // Check if user is platform admin
        const userResp = await fetch(API_BASE + '/api/members/' + data.memberId, {
            headers: { 'Authorization': `Bearer ${data.accessToken}` }
        });

        const user = await userResp.json();
        if (user.role !== 'plateforme') {
            throw new Error('Accès non autorisé - Administrateur plateforme requis');
        }

        // Store platform tokens separately
        localStorage.setItem('platformAccessToken', data.accessToken);
        localStorage.setItem('platformRefreshToken', data.refreshToken);
        localStorage.setItem('platformUserId', data.memberId);

        document.getElementById('platformAdminName').textContent = `${user.prenom} ${user.nom}`;
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
                    <h4>${group.nom} (${group.pays})</h4>
                    <p>Membres: ${group.members?.length || 0}</p>
                    <p>Portefeuille: ${group.wallet || 0} ${group.currency}</p>
                    <p>Créé le: ${new Date(group.createdAt).toLocaleDateString()}</p>
                </div>
            `;
        });
    } catch (err) {
        console.error(err);
        document.getElementById('allGroupsList').innerHTML = '<p>Erreur lors du chargement des groupes</p>';
    }
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
                    <h4>${member.prenom} ${member.nom}</h4>
                    <p>Téléphone: ${member.phone}</p>
                    <p>Rôle: ${member.role}</p>
                    <p>Groupe: ${member.groupId || 'Aucun'}</p>
                </div>
            `;
        });
    } catch (err) {
        console.error(err);
        document.getElementById('allMembersList').innerHTML = '<p>Erreur lors du chargement des membres</p>';
    }
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
                    <h4>${account.country}</h4>
                    <p>Numéro: ${account.phone}</p>
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
    const country = document.getElementById('momoCountry').value.trim();
    const phone = document.getElementById('momoPhone').value.trim();

    if (!country || !phone) {
        alert('Veuillez remplir tous les champs');
        return;
    }

    try {
        await apiRequest('/api/momo', {
            method: 'POST',
            body: JSON.stringify({ country, phone })
        });

        alert('Compte Momo ajouté avec succès');
        document.getElementById('momoCountry').value = '';
        document.getElementById('momoPhone').value = '';
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