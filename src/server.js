const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const bodyParser = require('body-parser');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'change-me-very-secret';
const ACCESS_TOKEN_EXPIRY = '15m';
const REFRESH_TOKEN_EXPIRY = '7d';

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(express.static('public')); // Serve static files from public folder

// Database setup
const db = new sqlite3.Database('./microcredit.db', (err) => {
    if (err) {
        console.error('Error opening database:', err.message);
    } else {
        console.log('Connected to SQLite database.');
        initDatabase();
    }
});

function initDatabase() {
    // Create tables
    db.run(`CREATE TABLE IF NOT EXISTS groups (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        country TEXT,
        province TEXT,
        city TEXT,
        currency TEXT,
        phone TEXT,
        wallet REAL DEFAULT 0,
        blocked BOOLEAN DEFAULT 0,
        cycle_length INTEGER DEFAULT 6,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS members (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        group_id INTEGER,
        member_id TEXT UNIQUE,
        prenom TEXT,
        name TEXT NOT NULL,
        phone TEXT,
        id_number TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        pin TEXT,
        parrain TEXT,
        role TEXT,
        password TEXT,
        wallet REAL DEFAULT 0,
        contribution REAL DEFAULT 0,
        cycle_contribution REAL DEFAULT 0,
        credit REAL DEFAULT 0,
        interest REAL DEFAULT 0,
        repayment REAL DEFAULT 0,
        withdrawals_date TEXT,
        withdrawals_count INTEGER DEFAULT 0,
        refresh_token TEXT,
        credit_request TEXT,
        FOREIGN KEY (group_id) REFERENCES groups (id)
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        group_id INTEGER,
        member_id INTEGER,
        action TEXT,
        date DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (group_id) REFERENCES groups (id),
        FOREIGN KEY (member_id) REFERENCES members (id)
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS platform_momo (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        country TEXT NOT NULL UNIQUE,
        phone_number TEXT NOT NULL,
        currency TEXT,
        description TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // Ensure schema compatibility for older databases
    ensureColumn('groups', 'phone', 'TEXT');
    ensureColumn('groups', 'blocked', 'BOOLEAN DEFAULT 0');
    ensureColumn('groups', 'cycle_length', 'INTEGER DEFAULT 6');
    ensureColumn('members', 'member_id', 'TEXT');
    ensureColumn('members', 'prenom', 'TEXT');
    ensureColumn('members', 'phone', 'TEXT');
    ensureColumn('members', 'id_number', 'TEXT');
    ensureColumn('members', 'pin', 'TEXT');
    ensureColumn('members', 'cycle_contribution', 'REAL DEFAULT 0');
    ensureColumn('members', 'interest', 'REAL DEFAULT 0');
    ensureColumn('members', 'repayment', 'REAL DEFAULT 0');
    ensureColumn('members', 'withdrawals_date', 'TEXT');
    ensureColumn('members', 'withdrawals_count', 'INTEGER DEFAULT 0');
    ensureColumn('members', 'credit_request', 'TEXT');
}

function ensureColumn(table, column, definition) {
    db.all(`PRAGMA table_info(${table})`, [], (err, rows) => {
        if (err) return;
        const exists = rows.some(r => r.name === column);
        if (!exists) {
            db.run(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
        }
    });
}

// Routes
// === Auth helpers ===
function generateAccessToken(user) {
    return jwt.sign({ id: user.id, role: user.role, phone: user.phone }, JWT_SECRET, { expiresIn: ACCESS_TOKEN_EXPIRY });
}

function generateRefreshToken() {
    return jwt.sign({ rand: Math.random() }, JWT_SECRET, { expiresIn: REFRESH_TOKEN_EXPIRY });
}

function authenticateToken(req, res, next) {
    const auth = req.headers['authorization'];
    const token = auth && auth.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Token manquant' });

    jwt.verify(token, JWT_SECRET, (err, payload) => {
        if (err) return res.status(403).json({ error: 'Token invalide' });
        req.user = payload;
        next();
    });
}

function authorizeRole(roles) {
    return (req, res, next) => {
        if (!req.user) return res.status(401).json({ error: 'Non authentifié' });
        if (!roles.includes(req.user.role)) return res.status(403).json({ error: 'Accès refusé' });
        next();
    };
}

app.get('/api/groups', authenticateToken, authorizeRole(['plateforme']), (req, res) => {
    db.all('SELECT * FROM groups', [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.put('/api/groups/:groupId', authenticateToken, authorizeRole(['plateforme']), (req, res) => {
    const groupId = req.params.groupId;
    const { blocked, wallet, cycle_length } = req.body;
    
    let updates = [];
    let values = [];
    
    if (blocked !== undefined) {
        updates.push('blocked = ?');
        values.push(blocked);
    }
    if (wallet !== undefined) {
        updates.push('wallet = ?');
        values.push(wallet);
    }
    if (cycle_length !== undefined) {
        updates.push('cycle_length = ?');
        values.push(cycle_length);
    }
    
    if (updates.length === 0) return res.status(400).json({ error: 'No updates provided' });
    
    values.push(groupId);
    
    db.run(`UPDATE groups SET ${updates.join(', ')} WHERE id = ?`, values, function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: 'Group updated' });
    });
});

app.get('/api/members', authenticateToken, authorizeRole(['plateforme']), (req, res) => {
    db.all('SELECT m.*, g.name as group_name FROM members m LEFT JOIN groups g ON m.group_id = g.id', [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// === Momo Accounts Management ===
app.get('/api/momo', authenticateToken, authorizeRole(['plateforme']), (req, res) => {
    db.all('SELECT * FROM platform_momo ORDER BY country', [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.post('/api/momo', authenticateToken, authorizeRole(['plateforme']), (req, res) => {
    const { country, phone_number, currency, description } = req.body;
    if (!country || !phone_number) return res.status(400).json({ error: 'country and phone_number required' });

    db.run('INSERT OR REPLACE INTO platform_momo (country, phone_number, currency, description) VALUES (?, ?, ?, ?)',
        [country, phone_number, currency, description], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ id: this.lastID });
    });
});

app.delete('/api/momo/:id', authenticateToken, authorizeRole(['plateforme']), (req, res) => {
    const id = req.params.id;
    db.run('DELETE FROM platform_momo WHERE id = ?', [id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ deleted: this.changes });
    });
});

// Get available countries (those with momo accounts)
app.get('/api/countries', (req, res) => {
    db.all('SELECT DISTINCT country, currency FROM platform_momo ORDER BY country', [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.post('/api/groups', authenticateToken, authorizeRole(['plateforme']), (req, res) => {
    const { name, country, province, city, currency, phone } = req.body;
    db.run('INSERT INTO groups (name, country, province, city, currency, phone) VALUES (?, ?, ?, ?, ?, ?)',
        [name, country, province, city, currency, phone], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ id: this.lastID });
    });
});

app.get('/api/members/:memberId', authenticateToken, (req, res) => {
    const memberId = req.params.memberId;
    db.get('SELECT * FROM members WHERE id = ?', [memberId], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!row) return res.status(404).json({ error: 'Membre introuvable' });
        res.json({
            ...row,
            pin: undefined,
            password: undefined,
            refresh_token: undefined
        });
    });
});

app.post('/api/auth/login', (req, res) => {
    const { phone, pin } = req.body;
    if(!phone || !pin) return res.status(400).json({ error: 'phone and pin required' });

    db.get('SELECT * FROM members WHERE phone = ?', [phone], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!row) return res.status(404).json({ error: 'Utilisateur introuvable' });

        const passwordMatch = row.password && bcrypt.compareSync(pin, row.password);
        const pinMatch = row.pin && bcrypt.compareSync(pin, row.pin);

        if (!passwordMatch && !pinMatch) {
            return res.status(401).json({ error: 'PIN / mot de passe incorrect' });
        }

        const accessToken = generateAccessToken(row);
        const refreshToken = generateRefreshToken();
        db.run('UPDATE members SET refresh_token = ? WHERE id = ?', [refreshToken, row.id]);

        // return basic member info along with token
        res.json({
            accessToken,
            refreshToken,
            member: {
                id: row.id,
                member_id: row.member_id,
                prenom: row.prenom,
                name: row.name,
                phone: row.phone,
                role: row.role,
                group_id: row.group_id
            }
        });
    });
});

app.post('/api/groups', (req, res) => {
    const { group, member } = req.body;

    // Check if platform admin exists
    db.get('SELECT COUNT(*) as count FROM members WHERE role = ?', ['plateforme'], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        const allowPlatform = row && row.count === 0;
        
        if (!group || !member) return res.status(400).json({ error: 'group and member required' });
        const { nom, continent, pays, province, ville, currency, phone } = group;
        const { prenom, nom: memberNom, phone: memberPhone, idNumber, role } = member;

        // Only allow platform admin creation if none exists
        if (role === 'plateforme' && !allowPlatform) {
            return res.status(403).json({ error: 'Administrateur plateforme déjà créé' });
        }

        const groupId = role === 'plateforme' ? null : Date.now(); // No group for platform admin
        const createdAt = new Date().toISOString();

        if (role === 'plateforme') {
            // Create platform admin without group
            const memberId = `PLATFORM-${Date.now().toString().slice(-6)}-${Math.floor(1000 + Math.random()*9000)}`;
            const pin = String(Math.floor(1000 + Math.random()*9000));
            const hashPin = bcrypt.hashSync(pin, 10);
            const hashPassword = bcrypt.hashSync(pin, 10);

            db.run(
                'INSERT INTO members (member_id, prenom, name, phone, id_number, role, pin, password, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
                [memberId, prenom, memberNom, memberPhone, idNumber, role, hashPin, hashPassword, createdAt],
                function(err) {
                    if (err) return res.status(500).json({ error: err.message });

                    const memberRow = {
                        id: this.lastID,
                        member_id: memberId,
                        prenom,
                        name: memberNom,
                        phone: memberPhone,
                        role
                    };

                    const accessToken = generateAccessToken(memberRow);
                    const refreshToken = generateRefreshToken();
                    db.run('UPDATE members SET refresh_token = ? WHERE id = ?', [refreshToken, memberRow.id]);

                    res.json({
                        member: memberRow,
                        pin,
                        accessToken,
                        refreshToken
                    });
                }
            );
        } else {
            // Create group and member
            db.run(
                'INSERT INTO groups (id, name, country, province, city, currency, phone, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
                [groupId, nom, pays, province, ville, currency, phone, createdAt],
                function(err) {
                    if (err) return res.status(500).json({ error: err.message });

                    const memberId = `AVEC-${Date.now().toString().slice(-6)}-${Math.floor(1000 + Math.random()*9000)}`;
                    const pin = String(Math.floor(1000 + Math.random()*9000));
                    const hashPin = bcrypt.hashSync(pin, 10);
                    const hashPassword = role === 'plateforme' ? bcrypt.hashSync(pin, 10) : null;

                    db.run(
                        'INSERT INTO members (group_id, member_id, prenom, name, phone, id_number, role, pin, password, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
                        [groupId, memberId, prenom, memberNom, memberPhone, idNumber, role, hashPin, hashPassword, createdAt],
                        function(err2) {
                            if (err2) return res.status(500).json({ error: err2.message });

                            const memberRow = {
                                id: this.lastID,
                                group_id: groupId,
                                member_id: memberId,
                                prenom,
                                name: memberNom,
                                phone: memberPhone,
                                role
                            };

                            const accessToken = generateAccessToken(memberRow);
                            const refreshToken = generateRefreshToken();
                            db.run('UPDATE members SET refresh_token = ? WHERE id = ?', [refreshToken, memberRow.id]);

                            res.json({
                                group: { id: groupId, name: nom, country: pays, province, city: ville, currency, phone, created_at: createdAt },
                                member: memberRow,
                                pin,
                                accessToken,
                                refreshToken
                            });
                        }
                    );
                }
            );
        }
    });
});

app.get('/api/groups/:groupId', authenticateToken, (req, res) => {
    const groupId = req.params.groupId;
    db.get('SELECT * FROM groups WHERE id = ?', [groupId], (err, group) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!group) return res.status(404).json({ error: 'Groupe introuvable' });

        db.all('SELECT * FROM members WHERE group_id = ?', [groupId], (err2, members) => {
            if (err2) return res.status(500).json({ error: err2.message });
            res.json({
                group: {
                    ...group,
                    password: undefined
                },
                members: members.map(m => {
                    let creditRequest = null;
                    try {
                        creditRequest = m.credit_request ? JSON.parse(m.credit_request) : null;
                    } catch (_) {
                        creditRequest = null;
                    }
                    return {
                        ...m,
                        creditRequest,
                        pin: undefined,
                        password: undefined,
                        refresh_token: undefined,
                        credit_request: undefined
                    };
                })
            });
        });
    });
});

// Provide some platform-level stats (total members, total contributions, credits, etc.)
app.get('/api/stats', authenticateToken, authorizeRole(['plateforme', 'comptable', 'president']), (req, res) => {
    db.all('SELECT COUNT(*) AS count, SUM(wallet) AS totalWallet, SUM(contribution) AS totalContributions, SUM(credit) AS totalCredit FROM members', (err, summary) => {
        if (err) return res.status(500).json({ error: err.message });
        const stats = summary[0] || { count: 0, totalWallet: 0, totalContributions: 0, totalCredit: 0 };
        stats.totalWallet = stats.totalWallet || 0;
        stats.totalContributions = stats.totalContributions || 0;
        stats.totalCredit = stats.totalCredit || 0;
        res.json({ stats });
    });
});

// Export members / history for reporting
app.get('/api/export/members', authenticateToken, authorizeRole(['plateforme', 'comptable', 'president']), (req, res) => {
    db.all('SELECT * FROM members', (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ members: rows });
    });
});

app.get('/api/export/history', authenticateToken, authorizeRole(['plateforme', 'comptable', 'president']), (req, res) => {
    db.all('SELECT * FROM history ORDER BY timestamp DESC', (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ history: rows });
    });
});

app.post('/api/auth/refresh', (req, res) => {
    const { refreshToken } = req.body;
    if (!refreshToken) return res.status(400).json({ error: 'refreshToken required' });

    db.get('SELECT * FROM members WHERE refresh_token = ?', [refreshToken], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!row) return res.status(403).json({ error: 'Refresh token invalide' });

        jwt.verify(refreshToken, JWT_SECRET, (err) => {
            if (err) return res.status(403).json({ error: 'Refresh token invalide' });
            const accessToken = generateAccessToken(row);
            res.json({ accessToken });
        });
    });
});

app.post('/api/members', authenticateToken, authorizeRole(['plateforme', 'president', 'comptable', 'secretaire']), (req, res) => {
    const {
        group_id,
        member_id,
        prenom,
        name,
        phone,
        idNumber,
        id_number,
        pin,
        parrain,
        role,
        password,
        wallet,
        contribution,
        cycle_contribution,
        credit,
        interest,
        repayment,
        withdrawals_date,
        withdrawals_count
    } = req.body;

    const finalIdNumber = idNumber || id_number;
    const finalMemberId = member_id || `AVEC-${Date.now().toString().slice(-6)}-${Math.floor(1000 + Math.random()*9000)}`;

    const hashedPin = pin ? bcrypt.hashSync(pin, 10) : null;
    const hashedPassword = password ? bcrypt.hashSync(password, 10) : null;

    db.run(`INSERT INTO members (group_id, member_id, prenom, name, phone, idNumber, pin, parrain, role, password, wallet, contribution, cycle_contribution, credit, interest, repayment, withdrawals_date, withdrawals_count)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [group_id, finalMemberId, prenom, name, phone, finalIdNumber, hashedPin, parrain, role, hashedPassword, wallet||0, contribution||0, cycle_contribution||0, credit||0, interest||0, repayment||0, withdrawals_date||null, withdrawals_count||0],
        function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ id: this.lastID, member_id: finalMemberId });
    });
});

// Update member (requires auth)
app.put('/api/members/:id', authenticateToken, authorizeRole(['plateforme', 'president', 'comptable', 'secretaire']), (req, res) => {
    const id = req.params.id;
    const updates = { ...req.body };

    // Handle structured fields
    if (updates.creditRequest !== undefined) {
        try {
            updates.credit_request = JSON.stringify(updates.creditRequest);
        } catch (e) {
            updates.credit_request = null;
        }
        delete updates.creditRequest;
    }

    const fields = Object.keys(updates).map(key => `${key} = ?`).join(', ');
    const values = Object.values(updates);
    values.push(id);
    db.run(`UPDATE members SET ${fields} WHERE id = ?`, values, function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ changes: this.changes });
    });
});

// Delete member (requires auth)
app.delete('/api/members/:id', authenticateToken, authorizeRole(['plateforme', 'president', 'comptable', 'secretaire']), (req, res) => {
    const id = req.params.id;
    db.run('DELETE FROM members WHERE id = ?', [id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ deleted: this.changes });
    });
});

app.put('/api/groups/:id', authenticateToken, (req, res) => {
    const id = req.params.id;
    const updates = req.body;
    const fields = Object.keys(updates).map(key => `${key} = ?`).join(', ');
    const values = Object.values(updates);
    values.push(id);
    db.run(`UPDATE groups SET ${fields} WHERE id = ?`, values, function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ changes: this.changes });
    });
});

app.post('/api/history', (req, res) => {
    const { group_id, member_id, action } = req.body;
    db.run('INSERT INTO history (group_id, member_id, action) VALUES (?, ?, ?)',
        [group_id, member_id, action], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ id: this.lastID });
    });
});

app.get('/api/chat/:groupId', (req, res) => {
    const groupId = req.params.groupId;
    db.all('SELECT * FROM chat_messages WHERE group_id = ? ORDER BY date ASC', [groupId], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.post('/api/chat', (req, res) => {
    const { group_id, sender, message, recipient } = req.body;
    db.run('INSERT INTO chat_messages (group_id, sender, message, recipient) VALUES (?, ?, ?, ?)',
        [group_id, sender, message, recipient], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ id: this.lastID });
    });
});

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});