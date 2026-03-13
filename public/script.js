// === AVEC Microcredit Application ===

// For production, change this to your deployed server URL
const API_BASE = window.location.hostname === 'localhost' ? 'http://localhost:3000' : 'https://your-server.com';

// Global variables
let membres = [];
let currentUserIndex = null;
let groupInfo = {};
let groupWallet = 0;
let chatMessages = [];

// === Navigation Functions ===
function hideAllSections() {
    const sections = document.querySelectorAll('section');
    sections.forEach(section => section.style.display = 'none');
}

function showInitialScreen() {
    hideAllSections();
    document.getElementById('initialSection').style.display = 'block';
}

function showLogin() {
    hideAllSections();
    document.getElementById('loginSection').style.display = 'block';
}

function showCreateGroup() {
    hideAllSections();
    document.getElementById('createGroupSection').style.display = 'block';
    document.getElementById('createGroupForm').style.display = 'block';
    populateContinents();
}

// === API Functions ===
async function apiRequest(path, options = {}) {
    const token = localStorage.getItem('accessToken');
    const headers = options.headers || {};
    headers['Content-Type'] = 'application/json';
    if (token) headers['Authorization'] = `Bearer ${token}`;

    let res = await fetch(API_BASE + path, { ...options, headers });
    if (res.status === 401 || res.status === 403) {
        const refreshToken = localStorage.getItem('refreshToken');
        if (refreshToken) {
            const refresh = await fetch(API_BASE + '/api/auth/refresh', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ refreshToken })
            });
            if (refresh.ok) {
                const data = await refresh.json();
                if (data.accessToken) {
                    setTokens(data.accessToken, refreshToken);
                    headers['Authorization'] = `Bearer ${data.accessToken}`;
                    res = await fetch(API_BASE + path, { ...options, headers });
                }
            }
        }
    }

    if (res.status === 401 || res.status === 403) {
        throw new Error('Non autorisé');
    }

    return res.json();
}

function setTokens(accessToken, refreshToken, groupId, userId) {
    localStorage.setItem('accessToken', accessToken);
    localStorage.setItem('refreshToken', refreshToken);
    if (groupId) localStorage.setItem('groupId', groupId);
    if (userId) localStorage.setItem('userId', userId);
}

function clearTokens() {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('groupId');
    localStorage.removeItem('userId');
}

// === Authentication Functions ===
async function login() {
    const phone = document.getElementById('loginPhone').value.trim();
    const pin = document.getElementById('loginPin').value.trim();

    if (!phone || !pin) {
        alert('Veuillez saisir votre téléphone et PIN');
        return;
    }

    try {
        const resp = await fetch(API_BASE + '/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phone, pin })
        });

        const data = await resp.json();
        if (!resp.ok) throw new Error(data.error || 'Erreur de connexion');

        setTokens(data.accessToken, data.refreshToken, data.groupId, data.memberId);

        await loadUserData();
        updateUserPanel();
        renderGroupInfo();
        afficherMembres();
        computeStats();

        alert('Connexion réussie !');

    } catch (err) {
        console.error(err);
        alert('Erreur de connexion: ' + err.message);
    }
}

function logout() {
    clearTokens();
    membres = [];
    currentUserIndex = null;
    groupInfo = {};
    groupWallet = 0;
    chatMessages = [];
    showInitialScreen();
}

// === User Data Loading ===
async function loadUserData() {
    const groupId = localStorage.getItem('groupId');
    const userId = localStorage.getItem('userId');
    if (!userId) throw new Error('No user ID found');

    // Get user info first
    const userResp = await apiRequest('/api/members/' + userId);
    const user = userResp;

    if (user.role === 'plateforme') {
        // Platform admin doesn't have a group
        membres = [user];
        currentUserIndex = 0;
        groupInfo = {};
        return;
    }

    if (!groupId) throw new Error('No group ID found');

    const groupData = await apiRequest(`/api/groups/${groupId}`);
    if (groupData && groupData.members) {
        membres = groupData.members;
        currentUserIndex = membres.findIndex(m => m.id == userId);
        groupInfo = groupData.group || groupInfo;
        groupWallet = groupInfo.wallet || 0;

        // Load chat messages
        try {
            const chatData = await apiRequest(`/api/chat/${groupId}`);
            chatMessages = chatData;
        } catch (err) {
            console.error('Failed to load chat:', err);
            chatMessages = [];
        }
    }
}

// === Group Creation ===
async function handleCreateGroup(e) {
    e.preventDefault();

    const groupData = {
        nom: document.getElementById('newGroupName').value.trim(),
        continent: document.getElementById('newGroupContinent').value,
        pays: document.getElementById('newGroupCountry').value,
        province: document.getElementById('newGroupProvince').value,
        ville: document.getElementById('newGroupCity').value,
        currency: document.getElementById('newGroupCurrency').value,
        phone: document.getElementById('newGroupPhone').value.trim(),
        member: {
            prenom: document.getElementById('firstPrenom').value.trim(),
            nom: document.getElementById('firstNom').value.trim(),
            phone: document.getElementById('firstPhone').value.trim(),
            idNumber: document.getElementById('firstIdNumber').value.trim(),
            role: 'admin'
        }
    };

    // Validation
    if (!groupData.nom || !groupData.pays || !groupData.phone || !groupData.member.prenom ||
        !groupData.member.nom || !groupData.member.phone || !groupData.member.idNumber) {
        alert('Tous les champs sont requis');
        return;
    }

    try {
        const resp = await fetch(API_BASE + '/api/groups', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(groupData)
        });

        const data = await resp.json();
        if (!resp.ok) throw new Error(data.error || 'Erreur création groupe');

        alert(`Groupe créé! PIN du président: ${data.pin}`);

        // Auto-login
        setTokens(data.accessToken, data.refreshToken, data.groupId, data.memberId);
        await loadUserData();
        updateUserPanel();
        renderGroupInfo();
        afficherMembres();
        computeStats();

    } catch (err) {
        console.error(err);
        alert('Erreur lors de la création du groupe: ' + err.message);
    }
}

// === UI Update Functions ===
function updateUserPanel() {
    if (currentUserIndex === null || !membres[currentUserIndex]) return;

    const user = membres[currentUserIndex];
    document.getElementById('userName').textContent = `${user.prenom} ${user.nom}`;
    document.getElementById('userRole').textContent = user.role;

    // Show/hide sections based on role
    document.getElementById('memberDashboard').style.display = 'block';
    document.getElementById('adminDashboard').style.display = user.role === 'admin' ? 'block' : 'none';
    document.getElementById('platformDashboard').style.display = user.role === 'plateforme' ? 'block' : 'none';

    // Update member stats
    document.getElementById('memberWallet').textContent = user.wallet || 0;
    document.getElementById('memberContribution').textContent = user.contribution || 0;
    document.getElementById('memberCredit').textContent = user.credit || 0;
    document.getElementById('memberInterest').textContent = user.interest || 0;
    document.getElementById('currencySymbol').textContent = groupInfo.currency || 'XOF';
}

function renderGroupInfo() {
    if (!groupInfo.nom) return;

    let html = `<h3>${groupInfo.nom}</h3>`;
    html += `<p>Pays: ${groupInfo.pays}</p>`;
    html += `<p>Portefeuille: ${groupWallet} ${groupInfo.currency || 'XOF'}</p>`;
    html += `<p>Membres: ${membres.length}</p>`;

    document.getElementById('groupInfo').innerHTML = html;
}

function afficherMembres() {
    const container = document.getElementById('listeMembres');
    if (!container) return;

    container.innerHTML = '<h3>Liste des membres</h3>';

    if (membres.length === 0) {
        container.innerHTML += '<p>Aucun membre</p>';
        return;
    }

    membres.forEach((membre, index) => {
        const isCurrentUser = index === currentUserIndex;
        container.innerHTML += `
            <div class="member-item ${isCurrentUser ? 'current-user' : ''}">
                <h4>${membre.prenom} ${membre.nom} ${isCurrentUser ? '(Vous)' : ''}</h4>
                <p>Téléphone: ${membre.phone}</p>
                <p>Rôle: ${membre.role}</p>
                <p>Portefeuille: ${membre.wallet || 0} ${groupInfo.currency || 'XOF'}</p>
            </div>
        `;
    });
}

function computeStats() {
    if (membres.length === 0) return;

    const totalMembers = membres.length;
    const totalWallet = membres.reduce((sum, m) => sum + (m.wallet || 0), 0);
    const totalContributions = membres.reduce((sum, m) => sum + (m.contribution || 0), 0);
    const activeCredits = membres.reduce((sum, m) => sum + (m.credit || 0), 0);

    const statsContainer = document.getElementById('stats');
    if (statsContainer) {
        statsContainer.innerHTML = `
            <div class="stat-item">Total membres: ${totalMembers}</div>
            <div class="stat-item">Portefeuille total: ${totalWallet} ${groupInfo.currency || 'XOF'}</div>
            <div class="stat-item">Contributions totales: ${totalContributions} ${groupInfo.currency || 'XOF'}</div>
            <div class="stat-item">Crédits actifs: ${activeCredits} ${groupInfo.currency || 'XOF'}</div>
        `;
    }
}

// === Data Population Functions ===
function populateContinents() {
    const sel = document.getElementById('newGroupContinent');
    if (!sel || !window.continents) return;

    sel.innerHTML = '<option value="">(continent)</option>';
    Object.keys(window.continents).forEach(cont => {
        sel.innerHTML += `<option value="${cont}">${cont}</option>`;
    });
}

function populateCountries() {
    const continent = document.getElementById('newGroupContinent').value;
    const sel = document.getElementById('newGroupCountry');
    if (!sel || !window.continents || !continent) return;

    sel.innerHTML = '<option value="">(sélectionner pays)</option>';
    if (window.continents[continent]) {
        window.continents[continent].forEach(country => {
            sel.innerHTML += `<option value="${country}">${country}</option>`;
        });
    }
}

function populateProvinces() {
    // Province is now an input field, no population needed
}

function populateCities() {
    // City is now an input field, no population needed
}


function populateCurrencies() {
    const country = document.getElementById('newGroupCountry').value;
    const sel = document.getElementById('newGroupCurrency');
    if (!sel || !window.geoData || !country || !window.geoData[country]) return;

    const currency = window.geoData[country].currency;
    if (currency) {
        sel.innerHTML = `<option value="${currency}">${currency}</option>`;
    } else {
        sel.innerHTML = '<option value="">(monnaie)</option>';
    }
}

function populateContinentList() {
    let sel = document.getElementById('groupContinent');
    if(!sel || !window.continents) return;
    sel.innerHTML = '<option value="">(continent)</option>';
    Object.keys(window.continents).forEach(cont=>{
        sel.innerHTML += `<option value="${cont}">${cont}</option>`;
    });
}

function populateCountryList() {
    let sel = document.getElementById('groupCountry');
    if(!sel) return;
    sel.innerHTML = '<option value="">(sélectionner pays)</option>';
    let cont = document.getElementById('groupContinent')?.value;
    let allCountries = [];
    if (window.continents) {
        Object.values(window.continents).forEach(arr => allCountries.push(...arr));
    }
    let countries = cont && window.continents && window.continents[cont] ? window.continents[cont] : allCountries;
    countries.forEach(c => {
        sel.innerHTML += `<option value="${c}">${c}</option>`;
    });
}

function populateProvinceList() {
    let country = document.getElementById('groupCountry').value;
    let currSel = document.getElementById('groupCurrency');
    currSel.innerHTML = '<option value="">(monnaie)</option>';
    if(country && window.geoData[country]) {
        if(window.geoData[country].currency) {
            currSel.innerHTML += `<option value="${window.geoData[country].currency}">${window.geoData[country].currency}</option>`;
        }
    }
}


function populateCityList() {
    // City is now an input field, no population needed
}


// === Initialization ===
document.addEventListener('DOMContentLoaded', async () => {
    // Populate location data
    populateContinents();

    // Location change listeners
    document.getElementById('newGroupContinent').addEventListener('change', populateCountries);
    document.getElementById('newGroupCountry').addEventListener('change', () => {
        populateProvinces();
        populateCities();
        populateCurrencies();
    });

    // Initial screen buttons
    document.getElementById('btnCreateGroup').addEventListener('click', showCreateGroup);
    document.getElementById('btnConnectGroup').addEventListener('click', showLogin);

    // Check if user is already logged in
    const token = localStorage.getItem('accessToken');
    if (token) {
        try {
            await loadUserData();
            document.getElementById('initialSection').style.display = 'none';
            document.getElementById('loginSection').style.display = 'none';
            updateUserPanel();
            renderGroupInfo();
            afficherMembres();
            computeStats();
        } catch (err) {
            console.error('Failed to load user data:', err);
            clearTokens();
            showInitialScreen();
        }
    } else {
        showInitialScreen();
    }

    // Form listeners
    document.getElementById('loginForm').addEventListener('submit', (e) => {
        e.preventDefault();
        login();
    });

    document.getElementById('createGroupForm').addEventListener('submit', (e) => {
        e.preventDefault();
        handleCreateGroup(e);
    });
});