const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const path = require('path');
const crypto = require('crypto');
const fs = require('fs');
const MOMO_COUNTRIES = require(path.join(__dirname, '..', 'public', 'momo-countries.js'));

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET;
const DATABASE_PATH = process.env.DATABASE_PATH || path.join(__dirname, '..', 'microcredit.db');
const ACCESS_TOKEN_EXPIRY = '15m';
const REFRESH_TOKEN_EXPIRY = '7d';
const GROUP_STAFF_ROLES = ['president', 'vice_president', 'comptable', 'secretaire'];
const MEMBER_ROLES = ['membre', 'parrain', ...GROUP_STAFF_ROLES];
const AVAILABILITY_VALUES = ['online', 'offline', 'busy'];
const ATTACHMENT_TYPES = new Set([
    'image/jpeg', 'image/png', 'image/webp', 'image/gif',
    'video/mp4', 'video/webm', 'application/pdf',
    'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/plain'
]);
const MAX_ATTACHMENT_BYTES = 6 * 1024 * 1024;
const MAX_SOCIAL_IMAGE_BYTES = 3 * 1024 * 1024;
const MAX_SOCIAL_MEDIA_BYTES = 100 * 1024 * 1024;
const PHONE_VERIFICATION_TTL_MS = Number(process.env.PHONE_VERIFICATION_TTL_MS || 10 * 60 * 1000);
const PHONE_VERIFICATION_MAX_ATTEMPTS = 5;
const phoneVerificationSessions = new Map();
const SOCIAL_SANDBOX_PRICING = Object.freeze({
    currency: 'USD',
    text_post_minor: 10,
    comment_minor: 5,
    image_post_minor: 20,
    video_base_minor: 50,
    video_per_started_mebibyte_minor: 10,
    video_cap_minor: 10000
});
const UPLOADS_DIRECTORY = process.env.UPLOADS_DIRECTORY || path.join(__dirname, '..', 'uploads');
const DEPLOYMENT_HOSTING_PROVIDERS = new Set(['self_hosted', 'render', 'railway', 'fly_io', 'heroku', 'other']);
const DEPLOYMENT_SMS_PROVIDERS = new Set(['sandbox', 'twilio', 'africastalking', 'infobip', 'other']);
const DEPLOYMENT_VIDEO_PROVIDERS = new Set(['none', 'jitsi', 'livekit', 'agora', 'twilio', 'other']);
const DEPLOYMENT_MOMO_PROVIDERS = new Set(['mtn', 'orange', 'airtel', 'vodacom']);

if (!JWT_SECRET) {
    throw new Error('JWT_SECRET must be set before starting the server.');
}

const corsOrigins = process.env.CORS_ORIGIN
    ? process.env.CORS_ORIGIN.split(',').map(origin => origin.trim()).filter(Boolean)
    : false;

app.use(cors({ origin: corsOrigins }));
app.post('/api/webhooks/:provider', express.raw({ type: '*/*', limit: '256kb' }), handlePaymentWebhook);
app.use('/api/collaboration/attachments', express.raw({ type: '*/*', limit: `${MAX_ATTACHMENT_BYTES}b` }));
app.use('/api/platform/dm-attachments', express.raw({ type: '*/*', limit: `${MAX_ATTACHMENT_BYTES}b` }));
app.use('/api/social/uploads', express.raw({ type: '*/*', limit: `${MAX_SOCIAL_MEDIA_BYTES}b` }));
app.use('/api/profile/avatar', express.raw({ type: '*/*', limit: `${MAX_SOCIAL_IMAGE_BYTES}b` }));
app.use(express.json({ limit: '256kb' }));
app.use(express.static(path.join(__dirname, '..', 'public')));

let resolveDatabaseReady;
const databaseReady = new Promise(resolve => { resolveDatabaseReady = resolve; });
const db = new sqlite3.Database(DATABASE_PATH, err => {
    if (err) {
        console.error('Error opening database:', err.message);
        process.exitCode = 1;
        return;
    }

    console.log('Connected to SQLite database.');
    initDatabase(resolveDatabaseReady);
});

function initDatabase(onReady) {
    db.serialize(() => {
        db.run('PRAGMA foreign_keys = ON');
        try {
            fs.mkdirSync(UPLOADS_DIRECTORY, { recursive: true, mode: 0o700 });
        } catch (err) {
            console.error('Error creating uploads directory:', err.message);
        }
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
        )`, logDatabaseError('creating groups table'));

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
            role_origin TEXT NOT NULL DEFAULT 'member',
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
            availability TEXT NOT NULL DEFAULT 'offline',
            profile_photo_filename TEXT,
            FOREIGN KEY (group_id) REFERENCES groups (id)
        )`, logDatabaseError('creating members table'));

        db.run(`CREATE TABLE IF NOT EXISTS history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            group_id INTEGER NOT NULL,
            member_id INTEGER NOT NULL,
            action TEXT NOT NULL,
            date DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (group_id) REFERENCES groups (id),
            FOREIGN KEY (member_id) REFERENCES members (id)
        )`, logDatabaseError('creating history table'));

        db.run(`CREATE TABLE IF NOT EXISTS chat_messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            group_id INTEGER NOT NULL,
            sender TEXT NOT NULL,
            sender_member_id INTEGER,
            message TEXT NOT NULL,
            recipient TEXT,
            conversation_type TEXT NOT NULL DEFAULT 'group',
            date DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (group_id) REFERENCES groups (id)
        )`, logDatabaseError('creating chat_messages table'));

        db.run(`CREATE TABLE IF NOT EXISTS message_reactions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            message_id INTEGER NOT NULL,
            member_id INTEGER NOT NULL,
            emoji TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(message_id, member_id, emoji),
            FOREIGN KEY (message_id) REFERENCES chat_messages (id) ON DELETE CASCADE,
            FOREIGN KEY (member_id) REFERENCES members (id) ON DELETE CASCADE
        )`, logDatabaseError('creating message_reactions table'));
        db.run(`CREATE TABLE IF NOT EXISTS chat_attachments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            group_id INTEGER NOT NULL,
            uploader_member_id INTEGER NOT NULL,
            message_id INTEGER,
            original_name TEXT NOT NULL,
            stored_name TEXT NOT NULL UNIQUE,
            mime_type TEXT NOT NULL,
            size_bytes INTEGER NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (group_id) REFERENCES groups (id),
            FOREIGN KEY (uploader_member_id) REFERENCES members (id),
            FOREIGN KEY (message_id) REFERENCES chat_messages (id) ON DELETE SET NULL
        )`, logDatabaseError('creating chat_attachments table'));
        db.run(`CREATE TABLE IF NOT EXISTS meetings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            group_id INTEGER NOT NULL,
            creator_member_id INTEGER NOT NULL,
            title TEXT NOT NULL,
            description TEXT,
            starts_at TEXT NOT NULL,
            ends_at TEXT NOT NULL,
            meeting_type TEXT NOT NULL DEFAULT 'conference',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (group_id) REFERENCES groups (id),
            FOREIGN KEY (creator_member_id) REFERENCES members (id)
        )`, logDatabaseError('creating meetings table'));
        db.run(`CREATE TABLE IF NOT EXISTS meeting_invites (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            meeting_id INTEGER NOT NULL,
            member_id INTEGER NOT NULL,
            response TEXT NOT NULL DEFAULT 'pending',
            responded_at DATETIME,
            UNIQUE(meeting_id, member_id),
            FOREIGN KEY (meeting_id) REFERENCES meetings (id) ON DELETE CASCADE,
            FOREIGN KEY (member_id) REFERENCES members (id) ON DELETE CASCADE
        )`, logDatabaseError('creating meeting_invites table'));
        db.run(`CREATE TABLE IF NOT EXISTS platform_accounts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            identifier TEXT NOT NULL UNIQUE,
            prenom TEXT NOT NULL,
            name TEXT NOT NULL,
            phone TEXT UNIQUE,
            password TEXT NOT NULL,
            identity_number TEXT,
            phone_verified_at DATETIME,
            pin_configured INTEGER NOT NULL DEFAULT 0,
            status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended')),
            visibility TEXT NOT NULL DEFAULT 'friends' CHECK (visibility IN ('public', 'friends', 'private')),
            availability TEXT NOT NULL DEFAULT 'offline' CHECK (availability IN ('online', 'offline', 'busy')),
            internal_wallet REAL NOT NULL DEFAULT 0,
            momo_wallet REAL NOT NULL DEFAULT 0,
            avatar_media_id INTEGER,
            refresh_token TEXT,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        )`, logDatabaseError('creating platform accounts table'));
        db.run(`CREATE TABLE IF NOT EXISTS platform_account_memberships (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            account_id INTEGER NOT NULL,
            group_id INTEGER NOT NULL,
            member_id INTEGER NOT NULL UNIQUE,
            status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'removed')),
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(account_id, group_id),
            FOREIGN KEY (account_id) REFERENCES platform_accounts(id),
            FOREIGN KEY (group_id) REFERENCES groups(id),
            FOREIGN KEY (member_id) REFERENCES members(id)
        )`, logDatabaseError('creating account memberships table'));
        db.run(`CREATE TABLE IF NOT EXISTS group_join_requests (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            group_id INTEGER NOT NULL,
            account_id INTEGER NOT NULL,
            note TEXT,
            status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
            reviewed_by_account_id INTEGER,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            reviewed_at DATETIME,
            UNIQUE(group_id, account_id),
            FOREIGN KEY (group_id) REFERENCES groups(id),
            FOREIGN KEY (account_id) REFERENCES platform_accounts(id)
        )`, logDatabaseError('creating join requests table'));
        db.run(`CREATE TABLE IF NOT EXISTS group_invitations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            group_id INTEGER NOT NULL,
            account_id INTEGER NOT NULL,
            invited_by_account_id INTEGER NOT NULL,
            role TEXT NOT NULL DEFAULT 'membre',
            status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined')),
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            responded_at DATETIME,
            UNIQUE(group_id, account_id),
            FOREIGN KEY (group_id) REFERENCES groups(id),
            FOREIGN KEY (account_id) REFERENCES platform_accounts(id)
        )`, logDatabaseError('creating group invitations table'));
        db.run(`CREATE TABLE IF NOT EXISTS group_elections (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            group_id INTEGER NOT NULL,
            role TEXT NOT NULL CHECK (role IN ('president', 'vice_president', 'secretaire', 'comptable')),
            title TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed_elected', 'closed_unfilled')),
            proposed_by_member_id INTEGER NOT NULL,
            closed_by_member_id INTEGER,
            elected_member_id INTEGER,
            active_member_count_at_close INTEGER,
            required_votes INTEGER,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            closed_at DATETIME,
            FOREIGN KEY (group_id) REFERENCES groups(id),
            FOREIGN KEY (proposed_by_member_id) REFERENCES members(id),
            FOREIGN KEY (closed_by_member_id) REFERENCES members(id),
            FOREIGN KEY (elected_member_id) REFERENCES members(id)
        )`, logDatabaseError('creating group elections table'));
        db.run(`CREATE TABLE IF NOT EXISTS group_election_candidates (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            election_id INTEGER NOT NULL,
            member_id INTEGER NOT NULL,
            UNIQUE(election_id, member_id),
            FOREIGN KEY (election_id) REFERENCES group_elections(id) ON DELETE CASCADE,
            FOREIGN KEY (member_id) REFERENCES members(id)
        )`, logDatabaseError('creating group election candidates table'));
        db.run(`CREATE TABLE IF NOT EXISTS group_election_votes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            election_id INTEGER NOT NULL,
            voter_member_id INTEGER NOT NULL,
            candidate_member_id INTEGER NOT NULL,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(election_id, voter_member_id),
            FOREIGN KEY (election_id) REFERENCES group_elections(id) ON DELETE CASCADE,
            FOREIGN KEY (voter_member_id) REFERENCES members(id),
            FOREIGN KEY (candidate_member_id) REFERENCES members(id)
        )`, logDatabaseError('creating group election votes table'));
        db.run(`CREATE TABLE IF NOT EXISTS group_election_audit (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            election_id INTEGER NOT NULL,
            group_id INTEGER NOT NULL,
            actor_member_id INTEGER,
            action TEXT NOT NULL,
            details_json TEXT NOT NULL DEFAULT '{}',
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (election_id) REFERENCES group_elections(id),
            FOREIGN KEY (group_id) REFERENCES groups(id),
            FOREIGN KEY (actor_member_id) REFERENCES members(id)
        )`, logDatabaseError('creating group election audit table'));
        db.run('CREATE INDEX IF NOT EXISTS idx_group_elections_group_status ON group_elections(group_id, status)', logDatabaseError('creating group elections index'));
        db.run('CREATE INDEX IF NOT EXISTS idx_group_election_votes_election ON group_election_votes(election_id)', logDatabaseError('creating group election votes index'));
        db.run(`CREATE TABLE IF NOT EXISTS account_notifications (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            account_id INTEGER NOT NULL,
            kind TEXT NOT NULL,
            message TEXT NOT NULL,
            reference_type TEXT,
            reference_id INTEGER,
            read_at DATETIME,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (account_id) REFERENCES platform_accounts(id)
        )`, logDatabaseError('creating account notifications table'));
        db.run(`CREATE TABLE IF NOT EXISTS friendships (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            account_one_id INTEGER NOT NULL,
            account_two_id INTEGER NOT NULL,
            requested_by_account_id INTEGER NOT NULL,
            status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected')),
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            responded_at DATETIME,
            UNIQUE(account_one_id, account_two_id),
            FOREIGN KEY (account_one_id) REFERENCES platform_accounts(id),
            FOREIGN KEY (account_two_id) REFERENCES platform_accounts(id)
        )`, logDatabaseError('creating friendships table'));
        db.run(`CREATE TABLE IF NOT EXISTS direct_messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            sender_account_id INTEGER NOT NULL,
            recipient_account_id INTEGER NOT NULL,
            message TEXT NOT NULL,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (sender_account_id) REFERENCES platform_accounts(id),
            FOREIGN KEY (recipient_account_id) REFERENCES platform_accounts(id)
        )`, logDatabaseError('creating direct messages table'));
        db.run(`CREATE TABLE IF NOT EXISTS direct_message_attachments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            sender_account_id INTEGER NOT NULL,
            recipient_account_id INTEGER NOT NULL,
            message_id INTEGER,
            original_name TEXT NOT NULL,
            stored_name TEXT NOT NULL UNIQUE,
            mime_type TEXT NOT NULL,
            size_bytes INTEGER NOT NULL,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (sender_account_id) REFERENCES platform_accounts(id),
            FOREIGN KEY (recipient_account_id) REFERENCES platform_accounts(id),
            FOREIGN KEY (message_id) REFERENCES direct_messages(id) ON DELETE SET NULL
        )`, logDatabaseError('creating direct message attachments table'));
        db.run(`CREATE TABLE IF NOT EXISTS direct_message_reactions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            message_id INTEGER NOT NULL,
            account_id INTEGER NOT NULL,
            emoji TEXT NOT NULL,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(message_id, account_id, emoji),
            FOREIGN KEY (message_id) REFERENCES direct_messages(id) ON DELETE CASCADE,
            FOREIGN KEY (account_id) REFERENCES platform_accounts(id) ON DELETE CASCADE
        )`, logDatabaseError('creating direct message reactions table'));
        db.run(`CREATE TABLE IF NOT EXISTS media_files (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            owner_account_id INTEGER NOT NULL,
            stored_name TEXT NOT NULL UNIQUE,
            original_name TEXT NOT NULL,
            mime_type TEXT NOT NULL,
            size_bytes INTEGER NOT NULL,
            purpose TEXT NOT NULL CHECK (purpose IN ('avatar', 'post')),
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (owner_account_id) REFERENCES platform_accounts(id)
        )`, logDatabaseError('creating media files table'));
        db.run(`CREATE TABLE IF NOT EXISTS social_posts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            author_account_id INTEGER NOT NULL,
            body TEXT NOT NULL,
            visibility TEXT NOT NULL DEFAULT 'friends' CHECK (visibility IN ('public', 'friends')),
            media_id INTEGER,
            moderation_status TEXT NOT NULL DEFAULT 'approved' CHECK (moderation_status IN ('approved', 'pending', 'removed')),
            moderation_reason TEXT,
            review_tag TEXT,
            deleted_at DATETIME,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (author_account_id) REFERENCES platform_accounts(id),
            FOREIGN KEY (media_id) REFERENCES media_files(id)
        )`, logDatabaseError('creating social posts table'));
        db.run(`CREATE TABLE IF NOT EXISTS post_reactions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            post_id INTEGER NOT NULL,
            account_id INTEGER NOT NULL,
            reaction TEXT NOT NULL,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(post_id, account_id, reaction),
            FOREIGN KEY (post_id) REFERENCES social_posts(id) ON DELETE CASCADE,
            FOREIGN KEY (account_id) REFERENCES platform_accounts(id)
        )`, logDatabaseError('creating post reactions table'));
        db.run(`CREATE TABLE IF NOT EXISTS post_comments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            post_id INTEGER NOT NULL,
            author_account_id INTEGER NOT NULL,
            body TEXT NOT NULL,
            parent_comment_id INTEGER,
            moderation_status TEXT NOT NULL DEFAULT 'approved' CHECK (moderation_status IN ('approved', 'pending', 'removed')),
            moderation_reason TEXT,
            review_tag TEXT,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (post_id) REFERENCES social_posts(id) ON DELETE CASCADE,
            FOREIGN KEY (author_account_id) REFERENCES platform_accounts(id),
            FOREIGN KEY (parent_comment_id) REFERENCES post_comments(id) ON DELETE CASCADE
        )`, logDatabaseError('creating post comments table'));
        db.run(`CREATE TABLE IF NOT EXISTS comment_reactions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            comment_id INTEGER NOT NULL,
            account_id INTEGER NOT NULL,
            reaction TEXT NOT NULL,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(comment_id, account_id, reaction),
            FOREIGN KEY (comment_id) REFERENCES post_comments(id) ON DELETE CASCADE,
            FOREIGN KEY (account_id) REFERENCES platform_accounts(id) ON DELETE CASCADE
        )`, logDatabaseError('creating comment reactions table'));
        db.run(`CREATE TABLE IF NOT EXISTS social_sandbox_ledger (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            payment_id TEXT NOT NULL UNIQUE,
            idempotency_key TEXT NOT NULL UNIQUE,
            content_type TEXT NOT NULL CHECK (content_type IN ('post', 'comment')),
            content_id INTEGER NOT NULL,
            charged_account_id INTEGER NOT NULL,
            post_author_account_id INTEGER,
            amount_minor INTEGER NOT NULL CHECK (amount_minor > 0),
            platform_amount_minor INTEGER NOT NULL CHECK (platform_amount_minor >= 0),
            author_amount_minor INTEGER NOT NULL CHECK (author_amount_minor >= 0),
            currency TEXT NOT NULL DEFAULT 'USD',
            sandbox BOOLEAN NOT NULL DEFAULT 1 CHECK (sandbox = 1),
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (charged_account_id) REFERENCES platform_accounts(id),
            FOREIGN KEY (post_author_account_id) REFERENCES platform_accounts(id)
        )`, logDatabaseError('creating social sandbox ledger'));
        db.run(`CREATE TABLE IF NOT EXISTS social_moderation_audit (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            audit_id TEXT NOT NULL UNIQUE,
            content_type TEXT NOT NULL CHECK (content_type IN ('post', 'comment', 'account')),
            content_id INTEGER NOT NULL,
            action TEXT NOT NULL CHECK (action IN ('queued', 'approved', 'removed', 'banned')),
            actor_member_id INTEGER,
            reason TEXT NOT NULL,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        )`, logDatabaseError('creating social moderation audit'));
        db.run(`CREATE TABLE IF NOT EXISTS post_reports (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            post_id INTEGER NOT NULL,
            reporter_account_id INTEGER NOT NULL,
            reason TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved')),
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(post_id, reporter_account_id),
            FOREIGN KEY (post_id) REFERENCES social_posts(id),
            FOREIGN KEY (reporter_account_id) REFERENCES platform_accounts(id)
        )`, logDatabaseError('creating post reports table'));
        db.run(`CREATE TABLE IF NOT EXISTS social_events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            creator_account_id INTEGER NOT NULL,
            title TEXT NOT NULL,
            description TEXT,
            starts_at TEXT NOT NULL,
            ends_at TEXT NOT NULL,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (creator_account_id) REFERENCES platform_accounts(id)
        )`, logDatabaseError('creating social events table'));
        db.run(`CREATE TABLE IF NOT EXISTS social_event_invites (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            event_id INTEGER NOT NULL,
            account_id INTEGER NOT NULL,
            response TEXT NOT NULL DEFAULT 'pending' CHECK (response IN ('pending', 'accepted', 'declined')),
            UNIQUE(event_id, account_id),
            FOREIGN KEY (event_id) REFERENCES social_events(id) ON DELETE CASCADE,
            FOREIGN KEY (account_id) REFERENCES platform_accounts(id)
        )`, logDatabaseError('creating social event invites table'));
        [
            'CREATE INDEX IF NOT EXISTS idx_memberships_account_group ON platform_account_memberships(account_id, group_id)',
            'CREATE INDEX IF NOT EXISTS idx_join_requests_group_status ON group_join_requests(group_id, status)',
            'CREATE INDEX IF NOT EXISTS idx_notifications_account_created ON account_notifications(account_id, created_at DESC)',
            'CREATE INDEX IF NOT EXISTS idx_friendships_status ON friendships(account_one_id, account_two_id, status)',
            'CREATE INDEX IF NOT EXISTS idx_direct_messages_conversation ON direct_messages(sender_account_id, recipient_account_id, created_at)',
            'CREATE INDEX IF NOT EXISTS idx_posts_created ON social_posts(created_at DESC)',
            'CREATE INDEX IF NOT EXISTS idx_post_comments_post ON post_comments(post_id, created_at)',
            'CREATE INDEX IF NOT EXISTS idx_social_sandbox_ledger_content ON social_sandbox_ledger(content_type, content_id)',
            'CREATE INDEX IF NOT EXISTS idx_social_moderation_pending ON social_posts(moderation_status, created_at)'
        ].forEach(sql => db.run(sql, logDatabaseError('creating social index')));

        db.run(`CREATE TABLE IF NOT EXISTS platform_momo (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            country TEXT NOT NULL,
            provider TEXT NOT NULL,
            phone_number TEXT NOT NULL,
            currency TEXT,
            description TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(country, provider)
        )`, logDatabaseError('creating platform_momo table'));

        db.run(`CREATE TABLE IF NOT EXISTS fraud_reports (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            group_id INTEGER NOT NULL,
            reporter_member_id INTEGER NOT NULL,
            details TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (group_id) REFERENCES groups (id),
            FOREIGN KEY (reporter_member_id) REFERENCES members (id)
        )`, logDatabaseError('creating fraud_reports table'));

        db.run(`CREATE TABLE IF NOT EXISTS review_requests (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            group_id INTEGER NOT NULL,
            requester_member_id INTEGER NOT NULL,
            message TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'pending',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            resolved_at DATETIME,
            resolved_by_member_id INTEGER,
            FOREIGN KEY (group_id) REFERENCES groups (id),
            FOREIGN KEY (requester_member_id) REFERENCES members (id),
            FOREIGN KEY (resolved_by_member_id) REFERENCES members (id)
        )`, logDatabaseError('creating review_requests table'));

        // SANDBOX-ONLY payment records are independent from the legacy REAL balance fields.
        // Amounts here are always integer minor units so reconciliation is auditable.
        db.run(`CREATE TABLE IF NOT EXISTS financial_ledger (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            transaction_id TEXT NOT NULL UNIQUE,
            group_id INTEGER NOT NULL,
            member_id INTEGER,
            transaction_type TEXT NOT NULL,
            amount_minor INTEGER NOT NULL CHECK (amount_minor > 0),
            currency TEXT NOT NULL,
            status TEXT NOT NULL CHECK (status IN ('pending', 'succeeded', 'failed', 'reversed')),
            provider TEXT NOT NULL,
            idempotency_key TEXT NOT NULL UNIQUE,
            external_reference TEXT,
            metadata_json TEXT NOT NULL DEFAULT '{}',
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (group_id) REFERENCES groups (id),
            FOREIGN KEY (member_id) REFERENCES members (id)
        )`, logDatabaseError('creating financial_ledger table'));
        db.run(`CREATE TABLE IF NOT EXISTS payment_attempts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            attempt_id TEXT NOT NULL UNIQUE,
            transaction_id TEXT NOT NULL,
            group_id INTEGER NOT NULL,
            member_id INTEGER,
            provider TEXT NOT NULL,
            direction TEXT NOT NULL CHECK (direction IN ('collection', 'disbursement')),
            status TEXT NOT NULL CHECK (status IN ('pending', 'succeeded', 'failed', 'reversed')),
            request_json TEXT NOT NULL,
            result_json TEXT NOT NULL,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (transaction_id) REFERENCES financial_ledger (transaction_id)
        )`, logDatabaseError('creating payment_attempts table'));
        db.run(`CREATE TABLE IF NOT EXISTS payment_events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            event_record_id TEXT NOT NULL UNIQUE,
            transaction_id TEXT,
            group_id INTEGER,
            provider TEXT,
            event_type TEXT NOT NULL,
            status TEXT,
            provider_event_id TEXT,
            payload_json TEXT NOT NULL DEFAULT '{}',
            actor_member_id INTEGER,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(provider, provider_event_id)
        )`, logDatabaseError('creating payment_events table'));
        db.run(`CREATE TABLE IF NOT EXISTS payment_operations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            operation_id TEXT NOT NULL UNIQUE,
            group_id INTEGER NOT NULL,
            member_id INTEGER NOT NULL,
            operation_type TEXT NOT NULL CHECK (operation_type = 'loan_disbursement'),
            amount_minor INTEGER NOT NULL CHECK (amount_minor > 0),
            currency TEXT NOT NULL,
            provider TEXT NOT NULL,
            destination_phone TEXT NOT NULL,
            status TEXT NOT NULL CHECK (status IN ('pending_approval', 'approved', 'rejected', 'disbursed')),
            requested_by_member_id INTEGER NOT NULL,
            approved_by_member_id INTEGER,
            transaction_id TEXT,
            metadata_json TEXT NOT NULL DEFAULT '{}',
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (group_id) REFERENCES groups (id),
            FOREIGN KEY (member_id) REFERENCES members (id),
            FOREIGN KEY (transaction_id) REFERENCES financial_ledger (transaction_id)
        )`, logDatabaseError('creating payment_operations table'));
        db.run(`CREATE TABLE IF NOT EXISTS payment_idempotency (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            idempotency_key TEXT NOT NULL UNIQUE,
            operation_scope TEXT NOT NULL,
            response_status INTEGER NOT NULL,
            response_json TEXT NOT NULL,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        )`, logDatabaseError('creating payment_idempotency table'));
        db.run(`CREATE TABLE IF NOT EXISTS financial_audit_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            audit_id TEXT NOT NULL UNIQUE,
            transaction_id TEXT,
            operation_id TEXT,
            group_id INTEGER,
            actor_member_id INTEGER,
            action TEXT NOT NULL,
            details_json TEXT NOT NULL DEFAULT '{}',
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        )`, logDatabaseError('creating financial_audit_log table'));
        db.run(`CREATE TABLE IF NOT EXISTS deployment_settings (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            public_base_url TEXT NOT NULL DEFAULT '',
            allowed_origins_json TEXT NOT NULL DEFAULT '[]',
            hosting_provider TEXT NOT NULL DEFAULT 'self_hosted',
            sms_provider TEXT NOT NULL DEFAULT 'sandbox',
            video_provider TEXT NOT NULL DEFAULT 'none',
            turn_urls_json TEXT NOT NULL DEFAULT '[]',
            momo_providers_json TEXT NOT NULL DEFAULT '[]',
            maintenance_mode INTEGER NOT NULL DEFAULT 0 CHECK (maintenance_mode IN (0, 1)),
            production_ready INTEGER NOT NULL DEFAULT 0 CHECK (production_ready IN (0, 1)),
            backup_verified INTEGER NOT NULL DEFAULT 0 CHECK (backup_verified IN (0, 1)),
            sandbox_acknowledged INTEGER NOT NULL DEFAULT 0 CHECK (sandbox_acknowledged IN (0, 1)),
            updated_by_member_id INTEGER,
            updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (updated_by_member_id) REFERENCES members (id)
        )`, logDatabaseError('creating deployment settings table'));
        db.run(`CREATE TABLE IF NOT EXISTS deployment_settings_audit (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            actor_member_id INTEGER NOT NULL,
            action TEXT NOT NULL CHECK (action = 'updated'),
            settings_json TEXT NOT NULL,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (actor_member_id) REFERENCES members (id)
        )`, logDatabaseError('creating deployment settings audit table'));
        db.run(`CREATE TRIGGER IF NOT EXISTS deployment_settings_audit_immutable_update
                BEFORE UPDATE ON deployment_settings_audit BEGIN SELECT RAISE(ABORT, 'deployment_settings_audit is append-only'); END`,
        logDatabaseError('protecting deployment settings audit updates'));
        db.run(`CREATE TRIGGER IF NOT EXISTS deployment_settings_audit_immutable_delete
                BEFORE DELETE ON deployment_settings_audit BEGIN SELECT RAISE(ABORT, 'deployment_settings_audit is append-only'); END`,
        logDatabaseError('protecting deployment settings audit deletes'));
        db.run('CREATE INDEX IF NOT EXISTS idx_financial_ledger_group_created ON financial_ledger (group_id, created_at DESC)', logDatabaseError('creating ledger index'));
        db.run('CREATE INDEX IF NOT EXISTS idx_payment_events_transaction ON payment_events (transaction_id, created_at DESC)', logDatabaseError('creating payment events index'));
        db.run('CREATE INDEX IF NOT EXISTS idx_payment_operations_group ON payment_operations (group_id, created_at DESC)', logDatabaseError('creating operations index'));
        db.run(`CREATE TRIGGER IF NOT EXISTS financial_ledger_immutable_update
                BEFORE UPDATE ON financial_ledger BEGIN SELECT RAISE(ABORT, 'financial_ledger is append-only'); END`, logDatabaseError('protecting financial ledger updates'));
        db.run(`CREATE TRIGGER IF NOT EXISTS financial_ledger_immutable_delete
                BEFORE DELETE ON financial_ledger BEGIN SELECT RAISE(ABORT, 'financial_ledger is append-only'); END`, logDatabaseError('protecting financial ledger deletes'));
        db.run(`CREATE TRIGGER IF NOT EXISTS payment_attempts_immutable_update
                BEFORE UPDATE ON payment_attempts BEGIN SELECT RAISE(ABORT, 'payment_attempts are append-only'); END`, logDatabaseError('protecting payment attempt updates'));
        db.run(`CREATE TRIGGER IF NOT EXISTS payment_attempts_immutable_delete
                BEFORE DELETE ON payment_attempts BEGIN SELECT RAISE(ABORT, 'payment_attempts are append-only'); END`, logDatabaseError('protecting payment attempt deletes'));
        db.run(`CREATE TRIGGER IF NOT EXISTS payment_events_immutable_update
                BEFORE UPDATE ON payment_events BEGIN SELECT RAISE(ABORT, 'payment_events are append-only'); END`, logDatabaseError('protecting payment event updates'));
        db.run(`CREATE TRIGGER IF NOT EXISTS payment_events_immutable_delete
                BEFORE DELETE ON payment_events BEGIN SELECT RAISE(ABORT, 'payment_events are append-only'); END`, logDatabaseError('protecting payment event deletes'));
        db.run(`CREATE TRIGGER IF NOT EXISTS financial_audit_log_immutable_update
                BEFORE UPDATE ON financial_audit_log BEGIN SELECT RAISE(ABORT, 'financial_audit_log is append-only'); END`, logDatabaseError('protecting financial audit updates'));
        db.run(`CREATE TRIGGER IF NOT EXISTS financial_audit_log_immutable_delete
                BEFORE DELETE ON financial_audit_log BEGIN SELECT RAISE(ABORT, 'financial_audit_log is append-only'); END`, logDatabaseError('protecting financial audit deletes'));

        migratePlatformMomo();
        migrateChatMessages();
        [
            ['groups', 'phone', 'TEXT'],
            ['groups', 'momo_provider', 'TEXT'],
            ['groups', 'blocked', 'BOOLEAN DEFAULT 0'],
            ['groups', 'cycle_length', 'INTEGER DEFAULT 6'],
            ['groups', 'created_at', 'DATETIME'],
            ['members', 'member_id', 'TEXT'],
            ['members', 'prenom', 'TEXT'],
            ['members', 'phone', 'TEXT'],
            ['members', 'id_number', 'TEXT'],
            ['members', 'created_at', 'DATETIME'],
            ['members', 'pin', 'TEXT'],
            ['members', 'cycle_contribution', 'REAL DEFAULT 0'],
            ['members', 'interest', 'REAL DEFAULT 0'],
            ['members', 'repayment', 'REAL DEFAULT 0'],
            ['members', 'withdrawals_date', 'TEXT'],
            ['members', 'withdrawals_count', 'INTEGER DEFAULT 0'],
            ['members', 'refresh_token', 'TEXT'],
            ['members', 'credit_request', 'TEXT'],
            ['members', 'role_origin', "TEXT NOT NULL DEFAULT 'member'"],
            ['social_posts', 'moderation_status', "TEXT NOT NULL DEFAULT 'approved'"],
            ['social_posts', 'moderation_reason', 'TEXT'],
            ['social_posts', 'review_tag', 'TEXT'],
            ['post_comments', 'parent_comment_id', 'INTEGER'],
            ['post_comments', 'moderation_status', "TEXT NOT NULL DEFAULT 'approved'"],
            ['post_comments', 'moderation_reason', 'TEXT'],
            ['post_comments', 'review_tag', 'TEXT'],
            ['direct_messages', 'attachment_id', 'INTEGER']
        ].forEach(([table, column, definition]) => ensureColumn(table, column, definition));
        migrateMemberCollaborationFields(() => migratePlatformAccountSecurityFields(() => migratePlatformAccounts(onReady)));
    });
}

function migratePlatformAccountSecurityFields(onComplete) {
    db.all('PRAGMA table_info(platform_accounts)', [], (err, columns) => {
        if (err) {
            console.error('Error reading platform account security schema:', err.message);
            return onComplete();
        }
        const missing = [
            ['identity_number', 'TEXT'],
            ['phone_verified_at', 'DATETIME'],
            ['pin_configured', 'INTEGER NOT NULL DEFAULT 0']
        ].filter(([column]) => !columns.some(existing => existing.name === column));
        const addNext = index => {
            if (index === missing.length) {
                return db.run(
                    'CREATE UNIQUE INDEX IF NOT EXISTS idx_platform_accounts_identity_number ON platform_accounts(identity_number) WHERE identity_number IS NOT NULL',
                    indexErr => {
                        if (indexErr) console.error('Error creating platform identity index:', indexErr.message);
                        onComplete();
                    }
                );
            }
            const [column, definition] = missing[index];
            db.run(`ALTER TABLE platform_accounts ADD COLUMN ${column} ${definition}`, alterErr => {
                if (alterErr) console.error(`Error adding platform_accounts.${column}:`, alterErr.message);
                addNext(index + 1);
            });
        };
        addNext(0);
    });
}

function migratePlatformMomo() {
    db.all('PRAGMA table_info(platform_momo)', [], (err, columns) => {
        if (err || columns.some(column => column.name === 'provider')) return;

        db.run('BEGIN IMMEDIATE', beginErr => {
            if (beginErr) {
                console.error('Error starting platform_momo migration:', beginErr.message);
                return;
            }
            db.run(`CREATE TABLE platform_momo_migrated (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                country TEXT NOT NULL,
                provider TEXT NOT NULL,
                phone_number TEXT NOT NULL,
                currency TEXT,
                description TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(country, provider)
            )`, createErr => {
                if (createErr) {
                    db.run('ROLLBACK');
                    console.error('Error creating platform_momo migration table:', createErr.message);
                    return;
                }
                db.run(
                    `INSERT INTO platform_momo_migrated
                        (id, country, provider, phone_number, currency, description, created_at)
                     SELECT id, country, 'Non précisé', phone_number, currency, description, created_at
                     FROM platform_momo`,
                    copyErr => {
                        if (copyErr) {
                            db.run('ROLLBACK');
                            console.error('Error copying platform_momo rows:', copyErr.message);
                            return;
                        }
                        db.run('DROP TABLE platform_momo', dropErr => {
                            if (dropErr) {
                                db.run('ROLLBACK');
                                console.error('Error replacing platform_momo table:', dropErr.message);
                                return;
                            }
                            db.run('ALTER TABLE platform_momo_migrated RENAME TO platform_momo', renameErr => {
                                if (renameErr) {
                                    db.run('ROLLBACK');
                                    console.error('Error finalizing platform_momo migration:', renameErr.message);
                                    return;
                                }
                                db.run('COMMIT', commitErr => {
                                    if (commitErr) console.error('Error committing platform_momo migration:', commitErr.message);
                                });
                            });
                        });
                    }
                );
            });
        });
    });
}

function migrateChatMessages() {
    db.all('PRAGMA table_info(chat_messages)', [], (err, columns) => {
        if (err) {
            console.error('Error reading chat_messages schema:', err.message);
            return;
        }

        const missingColumns = [
            ['sender_member_id', 'INTEGER'],
            ['conversation_type', "TEXT NOT NULL DEFAULT 'group'"]
        ].filter(([column]) => !columns.some(existing => existing.name === column));

        const addNextColumn = index => {
            if (index === missingColumns.length) {
                return db.run(
                    'CREATE INDEX IF NOT EXISTS idx_chat_messages_platform_conversation ON chat_messages (group_id, conversation_type, date)',
                    logDatabaseError('creating platform conversation index')
                );
            }
            const [column, definition] = missingColumns[index];
            db.run(`ALTER TABLE chat_messages ADD COLUMN ${column} ${definition}`, alterErr => {
                if (alterErr) {
                    console.error(`Error adding chat_messages.${column}:`, alterErr.message);
                    return;
                }
                addNextColumn(index + 1);
            });
        };

        addNextColumn(0);
    });
}

function migrateMemberCollaborationFields(onComplete) {
    db.all('PRAGMA table_info(members)', [], (err, columns) => {
        if (err) {
            console.error('Error reading member collaboration schema:', err.message);
            return onComplete();
        }
        const missing = [
            ['availability', "TEXT NOT NULL DEFAULT 'offline'"],
            ['profile_photo_filename', 'TEXT']
        ].filter(([column]) => !columns.some(existing => existing.name === column));
        const addNext = index => {
            if (index === missing.length) {
                db.run(
                    `UPDATE members SET role_origin = 'bootstrap'
                     WHERE role IN ('president', 'vice_president', 'comptable', 'secretaire')
                       AND (role_origin IS NULL OR role_origin = 'member')`,
                    () => db.run('CREATE INDEX IF NOT EXISTS idx_chat_attachments_group ON chat_attachments (group_id, message_id)', () => onComplete())
                );
                return;
            }
            const [column, definition] = missing[index];
            db.run(`ALTER TABLE members ADD COLUMN ${column} ${definition}`, alterErr => {
                if (alterErr) console.error(`Error adding members.${column}:`, alterErr.message);
                addNext(index + 1);
            });
        };
        addNext(0);
    });
}

// Legacy members remain the accounting record. This migration creates a separate,
// active platform identity and maps every existing group membership without changing
// member IDs, balances, roles, or history. The existing PIN hash is deliberately
// retained so a member can use either historical login entry point.
function migratePlatformAccounts(onComplete) {
    db.serialize(() => {
        db.run(
            `INSERT OR IGNORE INTO platform_accounts
             (identifier, prenom, name, phone, password, availability, internal_wallet, created_at)
             SELECT 'AVEC-LEGACY-' || id, COALESCE(NULLIF(prenom, ''), 'Membre'),
                    COALESCE(NULLIF(name, ''), 'AVEC'), phone,
                    COALESCE(NULLIF(pin, ''), ?), COALESCE(NULLIF(availability, ''), 'offline'),
                    COALESCE(wallet, 0), COALESCE(created_at, CURRENT_TIMESTAMP)
             FROM members WHERE role <> 'plateforme'`,
            [bcrypt.hashSync(crypto.randomUUID(), 10)],
            legacyAccountErr => {
               if (legacyAccountErr) console.error('Error backfilling platform accounts:', legacyAccountErr.message);
               db.run(
                   `UPDATE platform_accounts
                    SET password = (
                        SELECT m.pin FROM members m
                        WHERE platform_accounts.identifier = 'AVEC-LEGACY-' || m.id
                          AND m.pin IS NOT NULL AND m.pin <> ''
                    )
                    WHERE identifier LIKE 'AVEC-LEGACY-%'
                      AND EXISTS (
                          SELECT 1 FROM members m
                          WHERE platform_accounts.identifier = 'AVEC-LEGACY-' || m.id
                            AND m.pin IS NOT NULL AND m.pin <> ''
                      )`,
                   passwordErr => {
                       if (passwordErr) console.error('Error preserving legacy platform PINs:', passwordErr.message);
                       db.run(
                   `INSERT OR IGNORE INTO platform_account_memberships (account_id, group_id, member_id, status, created_at)
                    SELECT pa.id, m.group_id, m.id, 'active', COALESCE(m.created_at, CURRENT_TIMESTAMP)
                     FROM members m
                     JOIN platform_accounts pa ON pa.id = COALESCE(
                         (SELECT legacy_account.id FROM platform_accounts legacy_account
                          WHERE legacy_account.identifier = 'AVEC-LEGACY-' || m.id),
                         (SELECT phone_account.id FROM platform_accounts phone_account
                          WHERE phone_account.phone = m.phone)
                     )
                     WHERE m.role <> 'plateforme' AND m.group_id IS NOT NULL`,
                   membershipErr => {
                       if (membershipErr) console.error('Error backfilling account memberships:', membershipErr.message);
                       onComplete();
                   }
               );
                   }
               );
            }
        );
    });
}

function backfillLegacyMemberAccount(member, callback) {
    if (!member || member.role === 'plateforme' || !member.group_id) return callback();
    const fallbackPassword = bcrypt.hashSync(crypto.randomUUID(), 10);
    db.run(
        `INSERT OR IGNORE INTO platform_accounts
         (identifier, prenom, name, phone, password, availability, internal_wallet, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP))`,
        [
            `AVEC-LEGACY-${member.id}`,
            member.prenom || 'Membre',
            member.name || 'AVEC',
            member.phone || null,
            member.pin || fallbackPassword,
            member.availability || 'offline',
            Number(member.wallet || 0),
            member.created_at || null
        ],
        accountInsertErr => {
            if (accountInsertErr) return callback(accountInsertErr);
            db.get(
               `SELECT id FROM platform_accounts
                WHERE identifier = ? OR phone = ?
                ORDER BY CASE WHEN identifier = ? THEN 0 ELSE 1 END LIMIT 1`,
               [`AVEC-LEGACY-${member.id}`, member.phone || null, `AVEC-LEGACY-${member.id}`],
               (lookupErr, account) => {
                   if (lookupErr || !account) return callback(lookupErr || new Error('Compte plateforme introuvable'));
                   db.run(
                       `INSERT OR IGNORE INTO platform_account_memberships
                        (account_id, group_id, member_id, status, created_at)
                        VALUES (?, ?, ?, 'active', COALESCE(?, CURRENT_TIMESTAMP))`,
                       [account.id, member.group_id, member.id, member.created_at || null],
                       callback
                   );
               }
            );
        }
    );
}

function logDatabaseError(operation) {
    return err => {
        if (err) {
            console.error(`Error ${operation}:`, err.message);
        }
    };
}

function ensureColumn(table, column, definition) {
    db.all(`PRAGMA table_info(${table})`, [], (err, rows) => {
        if (err) {
            console.error(`Error reading ${table} schema:`, err.message);
            return;
        }

        if (!rows.some(row => row.name === column)) {
            db.run(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`, logDatabaseError(`adding ${table}.${column}`));
        }
    });
}

function generateAccessToken(member) {
    return jwt.sign({
        id: member.id,
        role: member.role,
        phone: member.phone,
        groupId: member.group_id
    }, JWT_SECRET, { expiresIn: ACCESS_TOKEN_EXPIRY });
}

function generateRefreshToken(memberId) {
    return jwt.sign({ memberId, type: 'refresh' }, JWT_SECRET, { expiresIn: REFRESH_TOKEN_EXPIRY });
}

function authenticateToken(req, res, next) {
    const authorization = req.headers.authorization;
    const token = authorization && authorization.startsWith('Bearer ') ? authorization.slice(7) : null;

    if (!token) {
        return res.status(401).json({ error: 'Token manquant' });
    }

    jwt.verify(token, JWT_SECRET, (err, payload) => {
        if (err || payload.type === 'refresh') {
            return res.status(403).json({ error: 'Token invalide' });
        }

        req.user = payload;
        next();
    });
}

function authorizeRole(roles) {
    return (req, res, next) => {
        if (!roles.includes(req.user.role)) {
            return res.status(403).json({ error: 'Accès refusé' });
        }

        next();
    };
}

function isPlatform(user) {
    return user.role === 'plateforme';
}

function isGroupStaff(user) {
    return GROUP_STAFF_ROLES.includes(user.role);
}

function hasGroupAccess(user, groupId) {
    return isPlatform(user) || String(user.groupId) === String(groupId);
}

function requireGroupAccess(req, res, groupId, next) {
    if (!hasGroupAccess(req.user, groupId)) {
        res.status(403).json({ error: 'Accès refusé pour ce groupe' });
        return;
    }

    next();
}

function requireGroupStaff(req, res, groupId, next) {
    if (!hasGroupAccess(req.user, groupId) || (!isPlatform(req.user) && !isGroupStaff(req.user))) {
        res.status(403).json({ error: 'Droits d’administration requis pour ce groupe' });
        return;
    }

    next();
}

function requireCollaborationMember(req, res, groupId, next) {
    if (isPlatform(req.user) || String(req.user.groupId) !== String(groupId)) {
        return res.status(403).json({ error: 'Les ressources de collaboration sont réservées aux membres du groupe' });
    }
    db.get('SELECT id FROM members WHERE id = ? AND group_id = ?', [req.user.id, groupId], (err, member) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!member) return res.status(403).json({ error: 'Les ressources de collaboration sont réservées aux membres du groupe' });
        next();
    });
}

function requirePlatformConversationAccess(req, res, groupId, next) {
    if (!/^\d+$/.test(String(groupId))) {
        return res.status(400).json({ error: 'Identifiant de groupe invalide' });
    }

    db.get('SELECT * FROM members WHERE id = ?', [req.user.id], (memberErr, actor) => {
        if (memberErr) return res.status(500).json({ error: memberErr.message });
        if (!actor) return res.status(401).json({ error: 'Utilisateur introuvable' });

        db.get('SELECT * FROM groups WHERE id = ?', [groupId], (groupErr, group) => {
            if (groupErr) return res.status(500).json({ error: groupErr.message });
            if (!group) return res.status(404).json({ error: 'Groupe introuvable' });
            if (actor.role === 'plateforme') return next(group, actor);
            if (actor.role === 'president' && String(actor.group_id) === String(group.id)) {
                return next(group, actor);
            }
            return res.status(403).json({ error: 'Cette conversation est réservée au président du groupe et à la plateforme' });
        });
    });
}

function validAmount(value) {
    const amount = Number(value);
    return Number.isFinite(amount) && amount > 0 && amount <= 1000000000 ? amount : null;
}

function normalizeMessage(value) {
    if (typeof value !== 'string') return null;
    const message = value
        .normalize('NFC')
        .replace(/\r\n?/g, '\n')
        .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
        .trim();
    return message && Array.from(message).length <= 1000 ? message : null;
}

function momoCountry(country) {
    return MOMO_COUNTRIES.find(entry => entry.name === country);
}

function normalizePhone(country, value) {
    if (typeof value !== 'string' || !/^[+()\s.-]*\d[+()\s.\d-]*$/.test(value)) return null;
    const countryInfo = momoCountry(country);
    if (!countryInfo) return null;

    const supplied = value.trim();
    const digits = supplied.replace(/\D/g, '');
    const dialDigits = countryInfo.dialCode.slice(1);
    let normalizedDigits;
    if (supplied.startsWith('+')) {
        if (!supplied.startsWith(countryInfo.dialCode)) return null;
        normalizedDigits = digits;
    } else if (digits.startsWith(dialDigits)) {
        normalizedDigits = digits;
    } else {
        normalizedDigits = dialDigits + digits.replace(/^0+/, '');
    }
    return normalizedDigits.length >= 8 && normalizedDigits.length <= 15 ? `+${normalizedDigits}` : null;
}

function validMomoSelection(country, provider, phone) {
    const countryInfo = momoCountry(country);
    if (!countryInfo || !countryInfo.providers.includes(provider)) return null;
    const normalizedPhone = normalizePhone(country, phone);
    return normalizedPhone ? { countryInfo, normalizedPhone } : null;
}

const PAYMENT_PROVIDERS = Object.freeze({
    mtn: 'MTN',
    orange: 'Orange',
    airtel: 'Airtel',
    vodacom: 'Vodacom'
});

function normalizePaymentProvider(value) {
    return PAYMENT_PROVIDERS[String(value || '').trim().toLowerCase()] || null;
}

function validMinorAmount(value) {
    const amount = Number(value);
    return Number.isSafeInteger(amount) && amount > 0 && amount <= 1000000000000 ? amount : null;
}

function json(value) {
    return JSON.stringify(value == null ? {} : value);
}

function parseStoredJson(value, fallback) {
    try {
        return JSON.parse(value);
    } catch (_) {
        return fallback;
    }
}

function isSafeDeploymentUrl(value, { originOnly = false } = {}) {
    if (typeof value !== 'string' || value.length > 2048 || /\s/.test(value)) return false;
    let parsed;
    try {
        parsed = new URL(value);
    } catch (_) {
        return false;
    }
    if (!['https:', 'http:'].includes(parsed.protocol) || parsed.username || parsed.password || parsed.search || parsed.hash) return false;
    if (parsed.protocol === 'http:' && !['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname)) return false;
    return !originOnly || (parsed.pathname === '/' && parsed.href === parsed.origin + '/');
}

function isSafeTurnUrl(value) {
    return typeof value === 'string'
        && value.length <= 300
        && /^(?:turn|turns):[A-Za-z0-9.-]+(?::(?:[1-9][0-9]{0,4}))?(?:\?transport=(?:udp|tcp))?$/.test(value);
}

function isStrictBoolean(value) {
    return typeof value === 'boolean';
}

function validateDeploymentSettings(input) {
    const allowedKeys = new Set([
        'publicBaseUrl', 'allowedOrigins', 'hostingProvider', 'smsProvider', 'videoProvider',
        'turnUrls', 'momoProviders', 'maintenanceMode', 'productionReady', 'backupVerified', 'sandboxAcknowledged'
    ]);
    if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(key => !allowedKeys.has(key))) {
        return { error: 'Paramètres de déploiement invalides.' };
    }
    const {
        publicBaseUrl, allowedOrigins, hostingProvider, smsProvider, videoProvider, turnUrls,
        momoProviders, maintenanceMode, productionReady, backupVerified, sandboxAcknowledged
    } = input;
    if (!isSafeDeploymentUrl(publicBaseUrl) || !Array.isArray(allowedOrigins) || allowedOrigins.length > 10
        || !allowedOrigins.every(origin => isSafeDeploymentUrl(origin, { originOnly: true }))
        || !DEPLOYMENT_HOSTING_PROVIDERS.has(hostingProvider)
        || !DEPLOYMENT_SMS_PROVIDERS.has(smsProvider)
        || !DEPLOYMENT_VIDEO_PROVIDERS.has(videoProvider)
        || !Array.isArray(turnUrls) || turnUrls.length > 10 || !turnUrls.every(isSafeTurnUrl)
        || !Array.isArray(momoProviders) || momoProviders.length > DEPLOYMENT_MOMO_PROVIDERS.size
        || new Set(momoProviders).size !== momoProviders.length || !momoProviders.every(provider => DEPLOYMENT_MOMO_PROVIDERS.has(provider))
        || ![maintenanceMode, productionReady, backupVerified, sandboxAcknowledged].every(isStrictBoolean)) {
        return { error: 'Les valeurs de déploiement ne respectent pas le format autorisé.' };
    }
    return {
        value: {
            publicBaseUrl, allowedOrigins, hostingProvider, smsProvider, videoProvider, turnUrls,
            momoProviders, maintenanceMode, productionReady, backupVerified, sandboxAcknowledged
        }
    };
}

function deploymentSettingsResponse(row) {
    const settings = {
        publicBaseUrl: row ? row.public_base_url : '',
        allowedOrigins: row ? parseStoredJson(row.allowed_origins_json, []) : [],
        hostingProvider: row ? row.hosting_provider : 'self_hosted',
        smsProvider: row ? row.sms_provider : 'sandbox',
        videoProvider: row ? row.video_provider : 'none',
        turnUrls: row ? parseStoredJson(row.turn_urls_json, []) : [],
        momoProviders: row ? parseStoredJson(row.momo_providers_json, []) : [],
        maintenanceMode: Boolean(row && row.maintenance_mode),
        productionReady: Boolean(row && row.production_ready),
        backupVerified: Boolean(row && row.backup_verified),
        sandboxAcknowledged: Boolean(row && row.sandbox_acknowledged),
        updatedAt: row ? row.updated_at : null
    };
    const configured = (...names) => names.some(name => Boolean(process.env[name]));
    const environment = [
        { id: 'jwt', label: 'JWT_SECRET', configured: configured('JWT_SECRET') },
        { id: 'database', label: 'DATABASE_PATH (base de données de production)', configured: configured('DATABASE_PATH') },
        { id: 'cors', label: 'CORS_ORIGIN', configured: configured('CORS_ORIGIN') },
        { id: 'sms', label: 'SMS_PROVIDER et identifiants SMS', configured: configured('SMS_PROVIDER', 'SMS_API_KEY', 'SMS_API_SECRET') },
        { id: 'paymentCredentials', label: 'Identifiants de paiement Momo (PAYMENT_PROVIDER_*)', configured: configured('PAYMENT_PROVIDER_MTN_CLIENT_SECRET', 'PAYMENT_PROVIDER_ORANGE_CLIENT_SECRET', 'PAYMENT_PROVIDER_AIRTEL_CLIENT_SECRET', 'PAYMENT_PROVIDER_VODACOM_CLIENT_SECRET') },
        { id: 'paymentWebhooks', label: 'Secrets webhook de paiement (PAYMENT_WEBHOOK_SECRET_*)', configured: configured('PAYMENT_WEBHOOK_SECRET_MTN', 'PAYMENT_WEBHOOK_SECRET_ORANGE', 'PAYMENT_WEBHOOK_SECRET_AIRTEL', 'PAYMENT_WEBHOOK_SECRET_VODACOM') },
        { id: 'storage', label: 'UPLOADS_DIRECTORY ou STORAGE_BUCKET', configured: configured('UPLOADS_DIRECTORY', 'STORAGE_BUCKET') },
        { id: 'turn', label: 'TURN_USERNAME et TURN_CREDENTIAL', configured: configured('TURN_USERNAME') && configured('TURN_CREDENTIAL') },
        { id: 'video', label: 'VIDEO_PROVIDER_SECRET', configured: configured('VIDEO_PROVIDER_SECRET') }
    ];
    const httpsReady = settings.publicBaseUrl.startsWith('https://');
    const domainReady = httpsReady && settings.allowedOrigins.length > 0 && settings.allowedOrigins.every(origin => origin.startsWith('https://'));
    const readiness = {
        httpsReady,
        domainReady,
        backupVerified: settings.backupVerified,
        productionDeclared: settings.productionReady,
        sandboxAcknowledged: settings.sandboxAcknowledged,
        secretsConfigured: environment.every(item => item.configured)
    };
    return {
        settings,
        environment,
        readiness,
        readinessSummary: { completed: Object.values(readiness).filter(Boolean).length, total: Object.keys(readiness).length },
        providerLabels: {
            hosting: ['self_hosted', 'render', 'railway', 'fly_io', 'heroku', 'other'],
            sms: ['sandbox', 'twilio', 'africastalking', 'infobip', 'other'],
            video: ['none', 'jitsi', 'livekit', 'agora', 'twilio', 'other'],
            momo: { mtn: 'MTN MoMo', orange: 'Orange Money', airtel: 'Airtel Money', vodacom: 'Vodacom M-Pesa' }
        }
    };
}

function newSecureId() {
    return crypto.randomUUID();
}

function paymentIdempotencyKey(req) {
    const key = req.get('Idempotency-Key') || req.body.idempotency_key;
    return typeof key === 'string' && /^[A-Za-z0-9._:-]{8,200}$/.test(key) ? key : null;
}

function sendIdempotencyReplay(res, existing) {
    let response;
    try {
        response = JSON.parse(existing.response_json);
    } catch (_) {
        response = { status: 'processing' };
    }
    response.idempotent_replay = true;
    res.status(existing.response_status).json(response);
}

function replayPaymentIdempotency(req, res, next) {
    const key = paymentIdempotencyKey(req);
    if (!key) return res.status(400).json({ error: 'Un en-tête Idempotency-Key valide est requis' });
    db.get(
        'SELECT response_status, response_json FROM payment_idempotency WHERE idempotency_key = ?',
        [key],
        (err, existing) => {
            if (err) return res.status(500).json({ error: err.message });
            if (existing) return sendIdempotencyReplay(res, existing);
            next();
        }
    );
}

function beginIdempotentMutation(req, res, scope, callback) {
    const key = paymentIdempotencyKey(req);
    if (!key) {
        res.status(400).json({ error: 'Un en-tête Idempotency-Key valide est requis' });
        return;
    }
    db.run(
        `INSERT INTO payment_idempotency (idempotency_key, operation_scope, response_status, response_json)
         VALUES (?, ?, 202, ?)`,
        [key, scope, json({ status: 'processing' })],
        function reserveIdempotency(err) {
            if (!err) {
                return callback(key, (status, response) => {
                    db.run(
                        'UPDATE payment_idempotency SET response_status = ?, response_json = ? WHERE idempotency_key = ?',
                        [status, json(response), key],
                        updateErr => {
                            if (updateErr) return res.status(500).json({ error: updateErr.message });
                            res.status(status).json(response);
                        }
                    );
                });
            }
            if (err.code !== 'SQLITE_CONSTRAINT') return res.status(500).json({ error: err.message });
            db.get(
                'SELECT response_status, response_json FROM payment_idempotency WHERE idempotency_key = ?',
                [key],
                (existingErr, existing) => {
                    if (existingErr) return res.status(500).json({ error: existingErr.message });
                    if (!existing) return res.status(409).json({ error: 'Clé d’idempotence en cours de traitement' });
                    sendIdempotencyReplay(res, existing);
                }
            );
        }
    );
}

// This adapter deliberately contains no HTTP client or provider endpoint. It is the only
// payment execution path until an official operator integration is separately reviewed.
const SANDBOX_PAYMENT_ADAPTER = Object.freeze({
    sandbox: true,
    collect(request) {
        return sandboxProviderResult('collection', request);
    },
    disburse(request) {
        return sandboxProviderResult('disbursement', request);
    }
});

function sandboxProviderResult(direction, request) {
    const digest = crypto.createHash('sha256')
        .update(`${direction}|${request.provider}|${request.idempotencyKey}|${request.amountMinor}`)
        .digest('hex');
    return {
        sandbox: true,
        status: 'succeeded',
        externalReference: `SANDBOX-${request.provider.toUpperCase()}-${digest.slice(0, 18)}`,
        providerResult: 'simulated_success'
    };
}

function auditFinancialChange({ transactionId = null, operationId = null, groupId = null, actorMemberId = null, action, details = {} }, callback) {
    db.run(
        `INSERT INTO financial_audit_log
         (audit_id, transaction_id, operation_id, group_id, actor_member_id, action, details_json)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [newSecureId(), transactionId, operationId, groupId, actorMemberId, action, json(details)],
        callback
    );
}

function createSandboxTransfer(input, callback) {
    const transactionId = newSecureId();
    const attemptId = newSecureId();
    const adapterResult = input.direction === 'collection'
        ? SANDBOX_PAYMENT_ADAPTER.collect(input)
        : SANDBOX_PAYMENT_ADAPTER.disburse(input);
    const metadata = {
        sandbox: true,
        direction: input.direction,
        operation_id: input.operationId || null,
        provider_result: adapterResult.providerResult
    };

    db.serialize(() => {
        db.run('BEGIN IMMEDIATE', beginErr => {
            if (beginErr) return callback(beginErr);
            db.run(
                `INSERT INTO financial_ledger
                 (transaction_id, group_id, member_id, transaction_type, amount_minor, currency, status, provider, idempotency_key, external_reference, metadata_json)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [transactionId, input.groupId, input.memberId, input.transactionType, input.amountMinor, input.currency,
                    adapterResult.status, input.provider.toLowerCase(), input.idempotencyKey, adapterResult.externalReference, json(metadata)],
                ledgerErr => {
                    if (ledgerErr) {
                        db.run('ROLLBACK');
                        return callback(ledgerErr);
                    }
                    db.run(
                        `INSERT INTO payment_attempts
                         (attempt_id, transaction_id, group_id, member_id, provider, direction, status, request_json, result_json)
                         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                        [attemptId, transactionId, input.groupId, input.memberId, input.provider.toLowerCase(), input.direction,
                            adapterResult.status, json({ sandbox: true, amount_minor: input.amountMinor }), json(adapterResult)],
                        attemptErr => {
                            if (attemptErr) {
                                db.run('ROLLBACK');
                                return callback(attemptErr);
                            }
                            db.run(
                                `INSERT INTO payment_events
                                 (event_record_id, transaction_id, group_id, provider, event_type, status, payload_json, actor_member_id)
                                 VALUES (?, ?, ?, ?, 'sandbox_transfer_simulated', ?, ?, ?)`,
                                [newSecureId(), transactionId, input.groupId, input.provider.toLowerCase(), adapterResult.status, json(metadata), input.actorMemberId],
                                eventErr => {
                                    if (eventErr) {
                                        db.run('ROLLBACK');
                                        return callback(eventErr);
                                    }
                                    auditFinancialChange({
                                        transactionId,
                                        operationId: input.operationId,
                                        groupId: input.groupId,
                                        actorMemberId: input.actorMemberId,
                                        action: 'sandbox_transfer_simulated',
                                        details: metadata
                                    }, auditErr => {
                                        if (auditErr) {
                                            db.run('ROLLBACK');
                                            return callback(auditErr);
                                        }
                                        db.run('COMMIT', commitErr => {
                                            if (commitErr) return callback(commitErr);
                                            callback(null, {
                                                transaction_id: transactionId,
                                                attempt_id: attemptId,
                                                status: adapterResult.status,
                                                provider: input.provider.toLowerCase(),
                                                external_reference: adapterResult.externalReference,
                                                sandbox: true
                                            });
                                        });
                                    });
                                }
                            );
                        }
                    );
                }
            );
        });
    });
}

function handlePaymentWebhook(req, res) {
    const provider = normalizePaymentProvider(req.params.provider);
    if (!provider) return res.status(404).json({ error: 'Fournisseur de paiement non pris en charge' });
    const secret = process.env[`PAYMENT_WEBHOOK_SECRET_${provider.toUpperCase()}`];
    if (!secret) return res.status(503).json({ error: 'Webhook non configuré pour ce fournisseur' });

    const signature = String(req.get('X-Payment-Signature') || '').replace(/^sha256=/i, '');
    const expected = crypto.createHmac('sha256', secret).update(req.body).digest('hex');
    const supplied = Buffer.from(signature, 'hex');
    const expectedBuffer = Buffer.from(expected, 'hex');
    if (!/^[a-f0-9]{64}$/i.test(signature) || supplied.length !== expectedBuffer.length ||
        !crypto.timingSafeEqual(supplied, expectedBuffer)) {
        return res.status(401).json({ error: 'Signature webhook invalide' });
    }

    let payload;
    try {
        payload = JSON.parse(req.body.toString('utf8'));
    } catch (_) {
        return res.status(400).json({ error: 'Payload webhook JSON invalide' });
    }
    const providerEventId = String(payload.event_id || payload.id || '').trim();
    if (!providerEventId || providerEventId.length > 200) {
        return res.status(400).json({ error: 'Identifiant d’événement requis' });
    }
    const transactionId = payload.transaction_id ? String(payload.transaction_id) : null;
    db.get('SELECT group_id FROM financial_ledger WHERE transaction_id = ?', [transactionId], (lookupErr, ledger) => {
        if (lookupErr) return res.status(500).json({ error: lookupErr.message });
        db.run(
            `INSERT INTO payment_events
             (event_record_id, transaction_id, group_id, provider, event_type, status, provider_event_id, payload_json)
             VALUES (?, ?, ?, ?, 'webhook_received', ?, ?, ?)`,
            [newSecureId(), transactionId, ledger ? ledger.group_id : null, provider.toLowerCase(),
                String(payload.status || 'received').slice(0, 30), providerEventId, json(payload)],
            function addWebhookReceipt(err) {
                if (err && err.code === 'SQLITE_CONSTRAINT') return res.json({ received: true, duplicate: true, sandbox: true });
                if (err) return res.status(500).json({ error: err.message });
                auditFinancialChange({
                    transactionId,
                    groupId: ledger ? ledger.group_id : null,
                    action: 'webhook_received',
                    details: { provider: provider.toLowerCase(), provider_event_id: providerEventId, sandbox: true }
                }, auditErr => {
                    if (auditErr) return res.status(500).json({ error: auditErr.message });
                    res.status(201).json({ received: true, receipt_id: this.lastID, sandbox: true });
                });
            }
        );
    });
}

function getGroup(groupId, callback) {
    db.get('SELECT * FROM groups WHERE id = ?', [groupId], callback);
}

function recordHistory(groupId, memberId, action, callback) {
    db.run(
        'INSERT INTO history (group_id, member_id, action) VALUES (?, ?, ?)',
        [groupId, memberId, action],
        callback
    );
}

function memberResponse(member) {
    const { pin, password, refresh_token, ...safeMember } = member;
    return safeMember;
}

function createMemberId(prefix = 'AVEC') {
    return `${prefix}-${Date.now().toString().slice(-6)}-${Math.floor(1000 + Math.random() * 9000)}`;
}

function createTokens(member, callback) {
    const refreshToken = generateRefreshToken(member.id);
    db.run('UPDATE members SET refresh_token = ? WHERE id = ?', [refreshToken, member.id], err => {
        if (err) {
            callback(err);
            return;
        }

        callback(null, {
            accessToken: generateAccessToken(member),
            refreshToken
        });
    });
}

function getMember(memberId, callback) {
    db.get('SELECT * FROM members WHERE id = ?', [memberId], callback);
}

function requireMemberAccess(req, res, memberId, requireStaff, next) {
    getMember(memberId, (err, member) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        if (!member) {
            return res.status(404).json({ error: 'Membre introuvable' });
        }

        if (isPlatform(req.user)) {
            return next(member);
        }

        if (String(req.user.id) === String(member.id) && !requireStaff) {
            return next(member);
        }

        if (isGroupStaff(req.user) && String(req.user.groupId) === String(member.group_id)) {
            return next(member);
        }

        return res.status(403).json({ error: 'Accès refusé pour ce membre' });
    });
}

function createGroup(group, member, res) {
    const { nom, name, pays, country, province, ville, city, currency, phone, momo_provider: momoProvider, momoProvider: alternateMomoProvider } = group;
    const groupName = nom || name;
    const groupCountry = pays || country;
    const selectedProvider = momoProvider || alternateMomoProvider;

    if (!groupName || !groupCountry || !province || !(ville || city) || !currency || !phone || !selectedProvider) {
        return res.status(400).json({ error: 'Informations de groupe incomplètes' });
    }
    if (!member || !member.prenom || !(member.nom || member.name) || !member.phone || !(member.idNumber || member.id_number)) {
        return res.status(400).json({ error: 'Informations du président incomplètes' });
    }

    const pin = String(Math.floor(1000 + Math.random() * 9000));
    const createdAt = new Date().toISOString();
    const memberId = createMemberId();
    const memberName = member.nom || member.name;
    const idNumber = member.idNumber || member.id_number;
    const momoSelection = validMomoSelection(groupCountry, selectedProvider, phone);
    if (!momoSelection) {
        return res.status(400).json({ error: 'Pays, opérateur Momo ou numéro de portefeuille invalide' });
    }

    db.run(
        'INSERT INTO groups (name, country, province, city, currency, phone, momo_provider, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [groupName, groupCountry, province, ville || city, momoSelection.countryInfo.currency, momoSelection.normalizedPhone, selectedProvider, createdAt],
        function insertGroup(err) {
            if (err) {
                return res.status(500).json({ error: err.message });
            }

            const groupId = this.lastID;
            db.run(
                `INSERT INTO members (group_id, member_id, prenom, name, phone, id_number, role, pin, created_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [groupId, memberId, member.prenom, memberName, member.phone, idNumber, 'president', bcrypt.hashSync(pin, 10), createdAt],
                function insertPresident(memberErr) {
                    if (memberErr) {
                        return res.status(500).json({ error: memberErr.message });
                    }

                    const createdMember = {
                        id: this.lastID,
                        group_id: groupId,
                        member_id: memberId,
                        prenom: member.prenom,
                        name: memberName,
                        phone: member.phone,
                        role: 'president'
                    };

                    createTokens(createdMember, (tokenErr, tokens) => {
                        if (tokenErr) {
                            return res.status(500).json({ error: tokenErr.message });
                        }

                        res.status(201).json({
                            group: {
                                id: groupId,
                                name: groupName,
                                country: groupCountry,
                                province,
                                city: ville || city,
                                currency: momoSelection.countryInfo.currency,
                                phone: momoSelection.normalizedPhone,
                                momo_provider: selectedProvider,
                                created_at: createdAt
                            },
                            member: createdMember,
                            groupId,
                            memberId: createdMember.id,
                            pin,
                            ...tokens
                        });
                    });
                }
            );
        }
    );
}

app.post('/api/platform-admin', (req, res) => {
    const { prenom, name, nom, phone, idNumber, id_number } = req.body;
    if (!prenom || !(name || nom) || !phone || !(idNumber || id_number)) {
        return res.status(400).json({ error: 'Informations administrateur incomplètes' });
    }

    db.get('SELECT COUNT(*) AS count FROM members WHERE role = ?', ['plateforme'], (err, row) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        if (row.count > 0) {
            return res.status(403).json({ error: 'Administrateur plateforme déjà créé' });
        }

        const pin = String(Math.floor(1000 + Math.random() * 9000));
        const member = {
            member_id: createMemberId('PLATFORM'),
            prenom,
            name: name || nom,
            phone,
            id_number: idNumber || id_number,
            role: 'plateforme'
        };

        db.run(
            `INSERT INTO members (member_id, prenom, name, phone, id_number, role, pin, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [member.member_id, member.prenom, member.name, member.phone, member.id_number, member.role, bcrypt.hashSync(pin, 10), new Date().toISOString()],
            function insertPlatformAdmin(insertErr) {
                if (insertErr) {
                    return res.status(500).json({ error: insertErr.message });
                }

                member.id = this.lastID;
                createTokens(member, (tokenErr, tokens) => {
                    if (tokenErr) {
                        return res.status(500).json({ error: tokenErr.message });
                    }

                    res.status(201).json({ member, memberId: member.id, pin, ...tokens });
                });
            }
        );
    });
});

app.post('/api/auth/login', (req, res) => {
    const { phone, pin } = req.body;
    if (!phone || !pin) {
        return res.status(400).json({ error: 'phone and pin required' });
    }

    db.get('SELECT * FROM members WHERE phone = ?', [phone], (err, member) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        if (!member || !member.pin || !bcrypt.compareSync(pin, member.pin)) {
            return res.status(401).json({ error: 'Téléphone ou PIN incorrect' });
        }

        createTokens(member, (tokenErr, tokens) => {
            if (tokenErr) {
                return res.status(500).json({ error: tokenErr.message });
            }

            res.json({
                ...tokens,
                memberId: member.id,
                groupId: member.group_id,
                member: memberResponse(member)
            });
        });
    });
});

app.post('/api/auth/platform-login', (req, res) => {
    const { phone, pin } = req.body;
    if (!phone || !pin) {
        return res.status(400).json({ error: 'phone and pin required' });
    }

    db.get('SELECT * FROM members WHERE phone = ? AND role = ?', [phone, 'plateforme'], (err, member) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        if (!member || !member.pin || !bcrypt.compareSync(pin, member.pin)) {
            return res.status(401).json({ error: 'Téléphone ou PIN incorrect' });
        }

        createTokens(member, (tokenErr, tokens) => {
            if (tokenErr) {
                return res.status(500).json({ error: tokenErr.message });
            }

            res.json({
                ...tokens,
                memberId: member.id,
                groupId: member.group_id,
                member: memberResponse(member)
            });
        });
    });
});

app.post('/api/auth/refresh', (req, res) => {
    const { refreshToken } = req.body;
    if (!refreshToken) {
        return res.status(400).json({ error: 'refreshToken required' });
    }

    jwt.verify(refreshToken, JWT_SECRET, (verifyErr, payload) => {
        if (verifyErr || payload.type !== 'refresh') {
            return res.status(403).json({ error: 'Refresh token invalide' });
        }

        db.get('SELECT * FROM members WHERE id = ? AND refresh_token = ?', [payload.memberId, refreshToken], (err, member) => {
            if (err) {
                return res.status(500).json({ error: err.message });
            }
            if (!member) {
                return res.status(403).json({ error: 'Refresh token invalide' });
            }

            const nextRefreshToken = generateRefreshToken(member.id);
            db.run('UPDATE members SET refresh_token = ? WHERE id = ?', [nextRefreshToken, member.id], updateErr => {
                if (updateErr) {
                    return res.status(500).json({ error: updateErr.message });
                }

                res.json({
                    accessToken: generateAccessToken(member),
                    refreshToken: nextRefreshToken
                });
            });
        });
    });
});

function accountAccessToken(account) {
    return jwt.sign({ accountId: account.id, platformAccount: true }, JWT_SECRET, { expiresIn: ACCESS_TOKEN_EXPIRY });
}

function accountRefreshToken(accountId) {
    return jwt.sign({ accountId, type: 'platform_refresh' }, JWT_SECRET, { expiresIn: REFRESH_TOKEN_EXPIRY });
}

function authenticateAccount(req, res, next) {
    const token = String(req.get('Authorization') || '').replace(/^Bearer\s+/i, '');
    if (!token) return res.status(401).json({ error: 'Connexion plateforme requise' });
    jwt.verify(token, JWT_SECRET, (err, payload) => {
        if (err || !payload.platformAccount || !payload.accountId) return res.status(403).json({ error: 'Session plateforme invalide' });
        db.get('SELECT * FROM platform_accounts WHERE id = ? AND status = ?', [payload.accountId, 'active'], (accountErr, account) => {
            if (accountErr) return res.status(500).json({ error: accountErr.message });
            if (!account) return res.status(403).json({ error: 'Compte plateforme inactif' });
            req.account = account;
            next();
        });
    });
}

function accountPublicResponse(account, includeWallet = false) {
    const result = {
        id: account.id, identifier: account.identifier, prenom: account.prenom, name: account.name,
        availability: account.availability, visibility: account.visibility, avatar_media_id: account.avatar_media_id || null,
        identityVerified: Boolean(account.identity_number),
        phoneVerified: Boolean(account.phone_verified_at),
        pinConfigured: Boolean(account.pin_configured),
        onboardingComplete: isAccountReadyForGroup(account)
    };
    if (includeWallet) {
        result.phone = account.phone;
        result.internal_wallet = Number(account.internal_wallet || 0);
        result.momo_wallet = Number(account.momo_wallet || 0);
        result.status = account.status;
    }
    return result;
}

function safeText(value, maximum = 1000) {
    if (typeof value !== 'string') return null;
    const text = value.normalize('NFC').replace(/[\u0000-\u001F\u007F]/g, ' ').trim();
    return text && Array.from(text).length <= maximum ? text : null;
}

function validPlatformPhone(phone) {
    return Boolean(phone && /^\+?[0-9()\s.-]{8,24}$/.test(phone));
}

function validIdentityNumber(identityNumber) {
    return Boolean(identityNumber && /^[\p{L}\p{N}][\p{L}\p{N} ./_-]{2,79}$/u.test(identityNumber));
}

function validPlatformPin(pin) {
    return /^\d{4}$/.test(pin);
}

function isAccountReadyForGroup(account) {
    return Boolean(account && account.identity_number && account.phone_verified_at && Number(account.pin_configured) === 1);
}

function browserVerificationSessionId(value) {
    const id = String(value || '');
    return /^[A-Za-z0-9_-]{20,128}$/.test(id) ? id : null;
}

function phoneVerificationKey(phone, sessionId) {
    return `${sessionId}:${phone}`;
}

// This delivery adapter is intentionally local-only. Replace it with an audited provider
// adapter at hosting time; it must never route a code through chat or notifications.
const SANDBOX_PHONE_DELIVERY = Object.freeze({
    deliver({ code }) {
        return { sandbox: true, sandboxCode: code };
    }
});

function requestSandboxPhoneVerification(phone, sessionId) {
    const now = Date.now();
    for (const [key, verification] of phoneVerificationSessions) {
        if (verification.expiresAt <= now) phoneVerificationSessions.delete(key);
    }
    const code = String(crypto.randomInt(100000, 1000000));
    const verification = {
        phone,
        expiresAt: now + PHONE_VERIFICATION_TTL_MS,
        attemptsRemaining: PHONE_VERIFICATION_MAX_ATTEMPTS,
        codeHash: bcrypt.hashSync(code, 10),
        verified: false,
        verificationToken: null
    };
    phoneVerificationSessions.set(phoneVerificationKey(phone, sessionId), verification);
    return {
        ...SANDBOX_PHONE_DELIVERY.deliver({ phone, code }),
        expiresAt: new Date(verification.expiresAt).toISOString(),
        attemptsRemaining: verification.attemptsRemaining
    };
}

function verifySandboxPhoneCode(phone, sessionId, code) {
    const key = phoneVerificationKey(phone, sessionId);
    const verification = phoneVerificationSessions.get(key);
    if (!verification) return { error: 'Demandez un nouveau code SANDBOX.' };
    if (verification.expiresAt <= Date.now()) {
        phoneVerificationSessions.delete(key);
        return { error: 'Le code SANDBOX a expiré. Demandez-en un nouveau.' };
    }
    if (verification.attemptsRemaining <= 0) return { error: 'Limite d’essais atteinte. Demandez un nouveau code SANDBOX.', status: 429 };
    if (!/^\d{6}$/.test(String(code || '')) || !bcrypt.compareSync(String(code), verification.codeHash)) {
        verification.attemptsRemaining -= 1;
        return {
            error: verification.attemptsRemaining
                ? 'Code SANDBOX invalide.'
                : 'Limite d’essais atteinte. Demandez un nouveau code SANDBOX.',
            status: verification.attemptsRemaining ? 400 : 429,
            attemptsRemaining: verification.attemptsRemaining
        };
    }
    verification.verified = true;
    verification.verificationToken = crypto.randomBytes(32).toString('base64url');
    return { verificationToken: verification.verificationToken, expiresAt: new Date(verification.expiresAt).toISOString() };
}

function hasVerifiedPhoneClaim(phone, sessionId, token) {
    const verification = phoneVerificationSessions.get(phoneVerificationKey(phone, sessionId));
    const suppliedToken = Buffer.from(String(token || ''));
    const expectedToken = Buffer.from(verification?.verificationToken || '');
    return Boolean(
        verification
        && verification.expiresAt > Date.now()
        && verification.verified
        && suppliedToken.length === expectedToken.length
        && suppliedToken.length > 0
        && crypto.timingSafeEqual(suppliedToken, expectedToken)
    );
}

function consumeVerifiedPhoneClaim(phone, sessionId) {
    phoneVerificationSessions.delete(phoneVerificationKey(phone, sessionId));
}

function notifyAccount(accountId, kind, message, referenceType = null, referenceId = null) {
    db.run(
        'INSERT INTO account_notifications (account_id, kind, message, reference_type, reference_id) VALUES (?, ?, ?, ?, ?)',
        [accountId, kind, message, referenceType, referenceId],
        logDatabaseError('creating account notification')
    );
}

function accountMembership(accountId, groupId, callback) {
    db.get(
        `SELECT pam.*, m.role FROM platform_account_memberships pam
         JOIN members m ON m.id = pam.member_id
         WHERE pam.account_id = ? AND pam.group_id = ? AND pam.status = 'active'`,
        [accountId, groupId], callback
    );
}

function requireAccountGroupStaff(req, res, groupId, next) {
    accountMembership(req.account.id, groupId, (err, membership) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!membership || !GROUP_STAFF_ROLES.includes(membership.role)) {
            return res.status(403).json({ error: 'Personnel du groupe requis' });
        }
        next(membership);
    });
}

function requireActiveGroupMember(req, res, groupId, next) {
    if (isPlatform(req.user) || String(req.user.groupId) !== String(groupId)) {
        return res.status(403).json({ error: 'Membre actif du groupe requis' });
    }
    db.get(
        `SELECT m.* FROM members m JOIN platform_account_memberships pam ON pam.member_id = m.id
         WHERE m.id = ? AND m.group_id = ? AND pam.status = 'active'`,
        [req.user.id, groupId],
        (err, member) => {
            if (err) return res.status(500).json({ error: err.message });
            if (!member) return res.status(403).json({ error: 'Membre actif du groupe requis' });
            next(member);
        }
    );
}

function requireActiveGroupStaff(req, res, groupId, next) {
    requireActiveGroupMember(req, res, groupId, member => {
        if (!GROUP_STAFF_ROLES.includes(member.role)) {
            return res.status(403).json({ error: 'Personnel actif du groupe requis' });
        }
        next(member);
    });
}

function notifyGroupMembers(groupId, kind, message, referenceType, referenceId) {
    db.all(
        `SELECT account_id FROM platform_account_memberships
         WHERE group_id = ? AND status = 'active'`,
        [groupId],
        (err, memberships) => {
            if (!err) memberships.forEach(membership => notifyAccount(membership.account_id, kind, message, referenceType, referenceId));
        }
    );
}

function recordElectionAudit(electionId, groupId, actorMemberId, action, details = {}) {
    db.run(
        `INSERT INTO group_election_audit (election_id, group_id, actor_member_id, action, details_json)
         VALUES (?, ?, ?, ?, ?)`,
        [electionId, groupId, actorMemberId || null, action, JSON.stringify(details)],
        logDatabaseError('recording election audit')
    );
}

function connectedAccounts(firstId, secondId, callback) {
    const [one, two] = [Number(firstId), Number(secondId)].sort((a, b) => a - b);
    db.get(
        'SELECT * FROM friendships WHERE account_one_id = ? AND account_two_id = ? AND status = ?',
        [one, two, 'accepted'], callback
    );
}

function canSeeAccount(viewerId, target, callback) {
    if (Number(viewerId) === Number(target.id) || target.visibility === 'public') return callback(null, true);
    connectedAccounts(viewerId, target.id, (err, friendship) => callback(err, Boolean(friendship)));
}

function isImageUpload(req) {
    const type = String(req.get('Content-Type') || '').toLowerCase().split(';')[0];
    const body = req.body;
    const magic = Buffer.isBuffer(body) && (
        (type === 'image/jpeg' && body.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))) ||
        (type === 'image/png' && body.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) ||
        (type === 'image/gif' && (body.subarray(0, 6).toString() === 'GIF87a' || body.subarray(0, 6).toString() === 'GIF89a')) ||
        (type === 'image/webp' && body.subarray(0, 4).toString() === 'RIFF' && body.subarray(8, 12).toString() === 'WEBP')
    );
    return magic ? type : null;
}

function isSocialMediaUpload(req) {
    const imageType = isImageUpload(req);
    if (imageType) return imageType;
    const type = String(req.get('Content-Type') || '').toLowerCase().split(';')[0];
    const body = req.body;
    if (!Buffer.isBuffer(body) || !body.length) return null;
    if (type === 'video/mp4' && body.length >= 12 && body.subarray(4, 8).toString() === 'ftyp') return type;
    if (type === 'video/webm' && body.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]))) return type;
    return null;
}

function saveSocialMedia(req, accountId, purpose, callback) {
    const mimeType = isSocialMediaUpload(req);
    if (!mimeType || !Buffer.isBuffer(req.body) || !req.body.length) return callback(new Error('Image ou vidéo JPEG, PNG, GIF, WebP, MP4 ou WebM valide requise'));
    const originalName = path.basename(String(req.get('X-File-Name') || 'image')).replace(/[^\w.\-]/g, '_').slice(0, 120) || 'image';
    const extension = {
        'image/jpeg': '.jpg', 'image/png': '.png', 'image/gif': '.gif', 'image/webp': '.webp',
        'video/mp4': '.mp4', 'video/webm': '.webm'
    }[mimeType];
    const storedName = `${crypto.randomUUID()}${extension}`;
    fs.writeFile(path.join(UPLOADS_DIRECTORY, storedName), req.body, { mode: 0o600 }, writeErr => {
        if (writeErr) return callback(writeErr);
        db.run(
            'INSERT INTO media_files (owner_account_id, stored_name, original_name, mime_type, size_bytes, purpose) VALUES (?, ?, ?, ?, ?, ?)',
            [accountId, storedName, originalName, mimeType, req.body.length, purpose],
            function insertMedia(insertErr) {
                if (insertErr) {
                    fs.unlink(path.join(UPLOADS_DIRECTORY, storedName), () => {});
                    return callback(insertErr);
                }

                function moderationClassification(text, filename = '') {
                    const value = `${text || ''} ${filename || ''}`.normalize('NFC').toLocaleLowerCase('fr-FR');
                    const prohibited = /\b(porn(?:o|ographique)?|xxx|onlyfans|nudes?|nudite|nudité|sexe|sexuel(?:le)?|escort)\b/u;
                    const political = /\b(politique|élection|election|parti|gouvernement|président(?:ielle)?|vote)\b/u;
                    if (prohibited.test(value)) {
                        return {
                            status: 'pending',
                            reason: 'Contenu potentiellement sexuel ou pornographique : examen humain requis.',
                            reviewTag: null
                        };
                    }
                    return {
                        status: 'approved',
                        reason: null,
                        reviewTag: political.test(value) ? 'politique_optionnel' : null
                    };
                }

                function socialPrice(contentType, media) {
                    if (contentType === 'comment') return SOCIAL_SANDBOX_PRICING.comment_minor;
                    if (!media) return SOCIAL_SANDBOX_PRICING.text_post_minor;
                    if (!String(media.mime_type).startsWith('video/')) return SOCIAL_SANDBOX_PRICING.image_post_minor;
                    const startedMebibytes = Math.max(1, Math.ceil(Number(media.size_bytes) / (1024 * 1024)));
                    return Math.min(
                        SOCIAL_SANDBOX_PRICING.video_cap_minor,
                        SOCIAL_SANDBOX_PRICING.video_base_minor + (startedMebibytes * SOCIAL_SANDBOX_PRICING.video_per_started_mebibyte_minor)
                    );
                }

                function socialReceipt(paymentId, amountMinor, platformAmountMinor, authorAmountMinor) {
                    return {
                        payment_id: paymentId,
                        sandbox: true,
                        currency: SOCIAL_SANDBOX_PRICING.currency,
                        amount_minor: amountMinor,
                        display: `${(amountMinor / 100).toFixed(2)} USD-équivalent SANDBOX`,
                        platform_amount_minor: platformAmountMinor,
                        post_author_amount_minor: authorAmountMinor,
                        notice: 'Écriture SANDBOX uniquement : aucun transfert ni conversion de devise réelle n’a été effectué.'
                    };
                }

                function writeSocialSandboxCharge({ idempotencyKey, contentType, contentId, chargedAccountId, postAuthorAccountId, amountMinor }, callback) {
                    const isComment = contentType === 'comment';
                    const authorAmountMinor = isComment ? Math.floor(amountMinor / 2) : 0;
                    const platformAmountMinor = amountMinor - authorAmountMinor;
                    const paymentId = `SANDBOX-SOCIAL-${crypto.createHash('sha256').update(idempotencyKey).digest('hex').slice(0, 18).toUpperCase()}`;
                    db.run(
                        `INSERT INTO social_sandbox_ledger
                         (payment_id, idempotency_key, content_type, content_id, charged_account_id, post_author_account_id, amount_minor, platform_amount_minor, author_amount_minor, currency)
                         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                        [paymentId, idempotencyKey, contentType, contentId, chargedAccountId, postAuthorAccountId || null, amountMinor, platformAmountMinor, authorAmountMinor, SOCIAL_SANDBOX_PRICING.currency],
                        err => callback(err, socialReceipt(paymentId, amountMinor, platformAmountMinor, authorAmountMinor))
                    );
                }

                function beginSocialMutation(req, res, scope, callback) {
                    const key = paymentIdempotencyKey(req);
                    if (key) return beginIdempotentMutation(req, res, scope, callback);
                    callback(`social-${newSecureId()}`, (status, response) => res.status(status).json(response));
                }

                callback(null, { id: this.lastID, mime_type: mimeType, size_bytes: req.body.length });
            }
        );
    });
}

function moderationClassification(text, filename = '') {
    const value = `${text || ''} ${filename || ''}`.normalize('NFC').toLocaleLowerCase('fr-FR');
    const prohibited = /\b(porn(?:o|ographique)?|xxx|onlyfans|nudes?|nudite|nudité|sexe|sexuel(?:le)?|escort)\b/u;
    const political = /\b(politique|élection|election|parti|gouvernement|président(?:ielle)?|vote)\b/u;
    if (prohibited.test(value)) {
        return { status: 'pending', reason: 'Contenu potentiellement sexuel ou pornographique : examen humain requis.', reviewTag: null };
    }
    return { status: 'approved', reason: null, reviewTag: political.test(value) ? 'politique_optionnel' : null };
}

function socialPrice(contentType, media) {
    if (contentType === 'comment') return SOCIAL_SANDBOX_PRICING.comment_minor;
    if (!media) return SOCIAL_SANDBOX_PRICING.text_post_minor;
    if (!String(media.mime_type).startsWith('video/')) return SOCIAL_SANDBOX_PRICING.image_post_minor;
    const startedMebibytes = Math.max(1, Math.ceil(Number(media.size_bytes) / (1024 * 1024)));
    return Math.min(SOCIAL_SANDBOX_PRICING.video_cap_minor, SOCIAL_SANDBOX_PRICING.video_base_minor + (startedMebibytes * SOCIAL_SANDBOX_PRICING.video_per_started_mebibyte_minor));
}

function socialReceipt(paymentId, amountMinor, platformAmountMinor, authorAmountMinor) {
    return {
        payment_id: paymentId, sandbox: true, currency: SOCIAL_SANDBOX_PRICING.currency, amount_minor: amountMinor,
        display: `${(amountMinor / 100).toFixed(2)} USD-équivalent SANDBOX`,
        platform_amount_minor: platformAmountMinor, post_author_amount_minor: authorAmountMinor,
        notice: 'Écriture SANDBOX uniquement : aucun transfert ni conversion de devise réelle n’a été effectué.'
    };
}

function writeSocialSandboxCharge({ idempotencyKey, contentType, contentId, chargedAccountId, postAuthorAccountId, amountMinor }, callback) {
    const authorAmountMinor = contentType === 'comment' ? Math.floor(amountMinor / 2) : 0;
    const platformAmountMinor = amountMinor - authorAmountMinor;
    const paymentId = `SANDBOX-SOCIAL-${crypto.createHash('sha256').update(idempotencyKey).digest('hex').slice(0, 18).toUpperCase()}`;
    db.run(
        `INSERT INTO social_sandbox_ledger
         (payment_id, idempotency_key, content_type, content_id, charged_account_id, post_author_account_id, amount_minor, platform_amount_minor, author_amount_minor, currency)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [paymentId, idempotencyKey, contentType, contentId, chargedAccountId, postAuthorAccountId || null, amountMinor, platformAmountMinor, authorAmountMinor, SOCIAL_SANDBOX_PRICING.currency],
        err => callback(err, socialReceipt(paymentId, amountMinor, platformAmountMinor, authorAmountMinor))
    );
}

function beginSocialMutation(req, res, scope, callback) {
    const key = paymentIdempotencyKey(req);
    if (key) return beginIdempotentMutation(req, res, scope, callback);
    callback(`social-${newSecureId()}`, (status, response) => res.status(status).json(response));
}

function canJoinAnotherGroup(accountId, callback) {
    db.get(
        `SELECT pa.status,
            EXISTS(
                SELECT 1 FROM platform_account_memberships pam JOIN groups g ON g.id = pam.group_id
                WHERE pam.account_id = pa.id AND pam.status = 'active' AND g.blocked = 1
            ) AS has_blocked_group,
            EXISTS(
                SELECT 1 FROM review_requests rr
                JOIN platform_account_memberships pam ON pam.member_id = rr.requester_member_id
                WHERE pam.account_id = pa.id AND pam.status = 'active' AND rr.status = 'pending'
            ) AS has_pending_review
         FROM platform_accounts pa WHERE pa.id = ?`,
        [accountId],
        (err, account) => {
            if (err) return callback(err);
            if (!account) return callback(new Error('Compte plateforme introuvable'));
            if (account.status !== 'active') return callback(null, 'Votre compte est bloqué ou en cours de révision : vous ne pouvez pas rejoindre un autre groupe.');
            if (account.has_blocked_group || account.has_pending_review) {
                return callback(null, 'Vous avez un différend, un blocage ou une révision non résolu(e) dans un groupe AVEC. Réglez-le avant de rejoindre un autre groupe.');
            }
            callback(null, null);
        }
    );
}

function addAccountToGroup(account, groupId, role, callback, options = {}) {
    const bootstrap = options.bootstrap === true;
    if (role !== 'membre' && !bootstrap) {
        return callback(new Error('Les rôles du personnel sont attribués uniquement par une élection clôturée.'));
    }
    if (!MEMBER_ROLES.includes(role)) return callback(new Error('Rôle de groupe invalide'));
    db.get('SELECT id FROM platform_account_memberships WHERE account_id = ? AND group_id = ?', [account.id, groupId], (lookupErr, existing) => {
        if (lookupErr) return callback(lookupErr);
        if (existing) return callback(new Error('Cette personne est déjà membre du groupe'));
        db.run(
            `INSERT INTO members (group_id, member_id, prenom, name, phone, id_number, role, role_origin, pin, availability)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [groupId, createMemberId(), account.prenom, account.name, account.phone, account.identifier, role,
                bootstrap ? 'bootstrap' : 'member', bcrypt.hashSync(crypto.randomUUID(), 10), account.availability],
            function insertMember(memberErr) {
                if (memberErr) return callback(memberErr);
                const memberId = this.lastID;
                db.run(
                    'INSERT INTO platform_account_memberships (account_id, group_id, member_id) VALUES (?, ?, ?)',
                    [account.id, groupId, memberId],
                    membershipErr => membershipErr ? callback(membershipErr) : callback(null, memberId)
                );
            }
        );
    });
}

function createGroupForAccount(account, group, res) {
    if (!isAccountReadyForGroup(account)) {
        return res.status(403).json({ error: 'Complétez votre identité, la vérification du téléphone et votre PIN dans le profil avant de créer un groupe.' });
    }
    const groupName = safeText(group.name || group.nom, 120);
    const country = safeText(group.country || group.pays, 80);
    const province = safeText(group.province, 100);
    const city = safeText(group.city || group.ville, 100);
    const provider = safeText(group.momo_provider || group.momoProvider, 40);
    const selection = country && provider ? validMomoSelection(country, provider, group.phone) : null;
    if (!groupName || !country || !province || !city || !selection) {
        return res.status(400).json({ error: 'Informations du groupe ou portefeuille Momo invalides' });
    }
    db.get(
        `SELECT 1 FROM platform_account_memberships pam JOIN members m ON m.id = pam.member_id
         WHERE pam.account_id = ? AND pam.status = 'active' AND m.role = 'president' LIMIT 1`,
        [account.id],
        (presidentErr, presidency) => {
            if (presidentErr) return res.status(500).json({ error: presidentErr.message });
            if (presidency) return res.status(409).json({ error: 'Vous êtes déjà président·e d’un groupe AVEC : la création d’un autre groupe n’est pas disponible.' });
            createGroup();
        }
    );

    function createGroup() {
    db.run(
        'INSERT INTO groups (name, country, province, city, currency, phone, momo_provider) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [groupName, country, province, city, selection.countryInfo.currency, selection.normalizedPhone, provider],
        function insertGroup(err) {
            if (err) return res.status(500).json({ error: err.message });
            const groupId = this.lastID;
            addAccountToGroup(account, groupId, 'president', memberErr => {
                if (memberErr) return res.status(500).json({ error: memberErr.message });
                // Keep the pre-existing group API usable immediately while the
                // platform account remains the mandatory creation authority.
                getMemberIdForAccount(account.id, groupId, (lookupErr, member) => {
                    if (lookupErr || !member) return res.status(500).json({ error: lookupErr ? lookupErr.message : 'Président introuvable' });
                    createTokens(member, (tokenErr, tokens) => {
                        if (tokenErr) return res.status(500).json({ error: tokenErr.message });
                        res.status(201).json({
                            groupId, memberId: member.id, member: memberResponse(member), ...tokens,
                            group: { id: groupId, name: groupName, country, province, city, currency: selection.countryInfo.currency },
                            dashboard: { path: 'index.html', groupId, memberId: member.id },
                            president: accountPublicResponse(account)
                        });
                    });
                });
            }, { bootstrap: true });
        }
    );
    }
}

function getMemberIdForAccount(accountId, groupId, callback) {
    db.get(
        `SELECT m.* FROM members m JOIN platform_account_memberships pam ON pam.member_id = m.id
         WHERE pam.account_id = ? AND pam.group_id = ? AND pam.status = 'active'`,
        [accountId, groupId], callback
    );
}

app.post('/api/platform/auth/register', (req, res) => {
    const prenom = safeText(req.body.prenom, 80);
    const name = safeText(req.body.name || req.body.nom, 80);
    const phone = safeText(req.body.phone, 30);
    const identityNumber = safeText(req.body.identityNumber, 80);
    const pin = String(req.body.pin || '');
    const pinConfirmation = String(req.body.pinConfirmation || '');
    const browserSessionId = browserVerificationSessionId(req.body.browserSessionId);
    const verificationToken = String(req.body.phoneVerificationToken || '');
    if (!prenom || !name || !validPlatformPhone(phone) || !validIdentityNumber(identityNumber) || !validPlatformPin(pin) || pin !== pinConfirmation) {
        return res.status(400).json({ error: 'Prénom, nom, identité/passeport, téléphone et PIN à 4 chiffres confirmé valides requis' });
    }
    if (!browserSessionId || !hasVerifiedPhoneClaim(phone, browserSessionId, verificationToken)) {
        return res.status(400).json({ error: 'Vérifiez ce téléphone dans cette session SANDBOX avant de créer le compte.' });
    }
    const identifier = `AVEC-${crypto.randomUUID().replace(/-/g, '').slice(0, 10).toUpperCase()}`;
    db.run(
        `INSERT INTO platform_accounts
         (identifier, prenom, name, phone, password, identity_number, phone_verified_at, pin_configured)
         VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, 1)`,
        [identifier, prenom, name, phone, bcrypt.hashSync(pin, 10), identityNumber],
        function registerAccount(err) {
            if (err && err.code === 'SQLITE_CONSTRAINT') return res.status(409).json({ error: 'Un compte existe déjà avec ce téléphone ou cette identité/passeport' });
            if (err) return res.status(500).json({ error: err.message });
            consumeVerifiedPhoneClaim(phone, browserSessionId);
            db.get('SELECT * FROM platform_accounts WHERE id = ?', [this.lastID], (lookupErr, account) => {
                if (lookupErr) return res.status(500).json({ error: lookupErr.message });
                const refreshToken = accountRefreshToken(account.id);
                db.run('UPDATE platform_accounts SET refresh_token = ? WHERE id = ?', [refreshToken, account.id], updateErr => {
                    if (updateErr) return res.status(500).json({ error: updateErr.message });
                    res.status(201).json({ accessToken: accountAccessToken(account), refreshToken, account: accountPublicResponse(account, true) });
                });
            });
        }
    );
});

app.post('/api/platform/phone-verifications/request', (req, res) => {
    const phone = safeText(req.body.phone, 30);
    const browserSessionId = browserVerificationSessionId(req.body.browserSessionId);
    if (!validPlatformPhone(phone) || !browserSessionId) {
        return res.status(400).json({ error: 'Téléphone et session navigateur valides requis.' });
    }
    const delivery = requestSandboxPhoneVerification(phone, browserSessionId);
    res.status(201).json({
        delivery: 'sandbox',
        message: 'Code disponible uniquement dans cette réponse SANDBOX de la session active; aucun SMS ni message de chat n’a été envoyé.',
        ...delivery
    });
});

app.post('/api/platform/phone-verifications/verify', (req, res) => {
    const phone = safeText(req.body.phone, 30);
    const browserSessionId = browserVerificationSessionId(req.body.browserSessionId);
    if (!validPlatformPhone(phone) || !browserSessionId) {
        return res.status(400).json({ error: 'Téléphone et session navigateur valides requis.' });
    }
    const result = verifySandboxPhoneCode(phone, browserSessionId, req.body.code);
    if (result.error) return res.status(result.status || 400).json(result);
    res.json({ verified: true, ...result });
});

app.post('/api/platform/auth/login', (req, res) => {
    const phone = safeText(req.body.phone, 30);
    const pin = String(req.body.pin || '');
    db.get('SELECT * FROM platform_accounts WHERE phone = ?', [phone], (err, account) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!account || account.status !== 'active' || !bcrypt.compareSync(pin, account.password)) return res.status(401).json({ error: 'Téléphone ou PIN incorrect' });
        const refreshToken = accountRefreshToken(account.id);
        db.run('UPDATE platform_accounts SET refresh_token = ? WHERE id = ?', [refreshToken, account.id], updateErr => {
            if (updateErr) return res.status(500).json({ error: updateErr.message });
            res.json({ accessToken: accountAccessToken(account), refreshToken, account: accountPublicResponse(account, true) });
        });
    });
});

app.post('/api/platform/auth/refresh', (req, res) => {
    const refreshToken = String(req.body.refreshToken || '');
    jwt.verify(refreshToken, JWT_SECRET, (verifyErr, payload) => {
        if (verifyErr || payload.type !== 'platform_refresh') return res.status(403).json({ error: 'Session invalide' });
        db.get('SELECT * FROM platform_accounts WHERE id = ? AND refresh_token = ? AND status = ?', [payload.accountId, refreshToken, 'active'], (err, account) => {
            if (err) return res.status(500).json({ error: err.message });
            if (!account) return res.status(403).json({ error: 'Session invalide' });
            const nextToken = accountRefreshToken(account.id);
            db.run('UPDATE platform_accounts SET refresh_token = ? WHERE id = ?', [nextToken, account.id], updateErr => {
                if (updateErr) return res.status(500).json({ error: updateErr.message });
                res.json({ accessToken: accountAccessToken(account), refreshToken: nextToken });
            });
        });
    });
});

app.get('/api/platform/profile', authenticateAccount, (req, res) => res.json({ account: accountPublicResponse(req.account, true) }));
app.put('/api/platform/profile', authenticateAccount, (req, res) => {
    const prenom = safeText(req.body.prenom, 80);
    const name = safeText(req.body.name, 80);
    const visibility = String(req.body.visibility || '');
    const availability = String(req.body.availability || '');
    if (!prenom || !name || !['public', 'friends', 'private'].includes(visibility) || !AVAILABILITY_VALUES.includes(availability)) {
        return res.status(400).json({ error: 'Profil invalide' });
    }
    db.run('UPDATE platform_accounts SET prenom = ?, name = ?, visibility = ?, availability = ? WHERE id = ?', [prenom, name, visibility, availability, req.account.id], err => {
        if (err) return res.status(500).json({ error: err.message });
        db.get('SELECT * FROM platform_accounts WHERE id = ?', [req.account.id], (lookupErr, account) => lookupErr ? res.status(500).json({ error: lookupErr.message }) : res.json({ account: accountPublicResponse(account, true) }));
    });
});
app.put('/api/platform/profile/security', authenticateAccount, (req, res) => {
    const needsIdentity = !req.account.identity_number;
    const needsPhoneVerification = !req.account.phone_verified_at;
    const needsPin = Number(req.account.pin_configured) !== 1;
    if (!needsIdentity && !needsPhoneVerification && !needsPin) {
        return res.json({ account: accountPublicResponse(req.account, true) });
    }

    const identityNumber = safeText(req.body.identityNumber, 80);
    const pin = String(req.body.pin || '');
    const pinConfirmation = String(req.body.pinConfirmation || '');
    const browserSessionId = browserVerificationSessionId(req.body.browserSessionId);
    const verificationToken = String(req.body.phoneVerificationToken || '');
    if ((needsIdentity && !validIdentityNumber(identityNumber))
        || (needsPin && (!validPlatformPin(pin) || pin !== pinConfirmation))
        || (needsPhoneVerification && (!browserSessionId || !hasVerifiedPhoneClaim(req.account.phone, browserSessionId, verificationToken)))) {
        return res.status(400).json({ error: 'Complétez l’identité/passeport, le PIN à 4 chiffres confirmé et la vérification du téléphone requis.' });
    }

    db.run(
        `UPDATE platform_accounts SET
            identity_number = COALESCE(identity_number, ?),
            password = CASE WHEN pin_configured = 0 THEN ? ELSE password END,
            pin_configured = CASE WHEN pin_configured = 0 THEN 1 ELSE pin_configured END,
            phone_verified_at = CASE WHEN phone_verified_at IS NULL THEN CURRENT_TIMESTAMP ELSE phone_verified_at END
         WHERE id = ?`,
        [identityNumber, needsPin ? bcrypt.hashSync(pin, 10) : null, req.account.id],
        err => {
            if (err && err.code === 'SQLITE_CONSTRAINT') return res.status(409).json({ error: 'Cette identité/passeport est déjà utilisée.' });
            if (err) return res.status(500).json({ error: err.message });
            if (needsPhoneVerification) consumeVerifiedPhoneClaim(req.account.phone, browserSessionId);
            db.get('SELECT * FROM platform_accounts WHERE id = ?', [req.account.id], (lookupErr, account) => {
                if (lookupErr) return res.status(500).json({ error: lookupErr.message });
                res.json({ account: accountPublicResponse(account, true) });
            });
        }
    );
});
app.post('/api/profile/avatar', authenticateAccount, (req, res) => {
    saveSocialImage(req, req.account.id, 'avatar', (err, media) => {
        if (err) return res.status(400).json({ error: err.message });
        db.run('UPDATE platform_accounts SET avatar_media_id = ? WHERE id = ?', [media.id, req.account.id], updateErr => updateErr ? res.status(500).json({ error: updateErr.message }) : res.status(201).json({ media }));
    });
});

app.post('/api/groups', authenticateAccount, (req, res) => createGroupForAccount(req.account, req.body.group || req.body, res));

app.get('/api/groups', authenticateToken, authorizeRole(['plateforme']), (req, res) => {
    db.all(
        `SELECT g.*, COUNT(m.id) AS member_count
         FROM groups g
         LEFT JOIN members m ON m.group_id = g.id
         GROUP BY g.id
         ORDER BY g.created_at DESC`,
        [],
        (err, rows) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        res.json(rows);
        }
    );
});

app.get('/api/groups/:groupId', authenticateToken, (req, res) => {
    const groupId = req.params.groupId;
    requireGroupAccess(req, res, groupId, () => {
        db.get('SELECT * FROM groups WHERE id = ?', [groupId], (err, group) => {
            if (err) {
                return res.status(500).json({ error: err.message });
            }
            if (!group) {
                return res.status(404).json({ error: 'Groupe introuvable' });
            }

            db.all('SELECT * FROM members WHERE group_id = ?', [groupId], (membersErr, members) => {
                if (membersErr) {
                    return res.status(500).json({ error: membersErr.message });
                }
                res.json({ group, members: members.map(memberResponse) });
            });
        });
    });
});

app.put('/api/groups/:groupId', authenticateToken, (req, res) => {
    const groupId = req.params.groupId;
    const allowedFields = ['cycle_length'];
    const updates = Object.entries(req.body).filter(([key]) => allowedFields.includes(key));

    if (updates.length === 0) {
        return res.status(400).json({ error: 'Aucune modification autorisée fournie' });
    }

    requireGroupStaff(req, res, groupId, () => {
        const fields = updates.map(([key]) => `${key} = ?`).join(', ');
        const values = updates.map(([, value]) => value);
        values.push(groupId);
        db.run(`UPDATE groups SET ${fields} WHERE id = ?`, values, function updateGroup(err) {
            if (err) {
                return res.status(500).json({ error: err.message });
            }
            if (!this.changes) {
                return res.status(404).json({ error: 'Groupe introuvable' });
            }
            res.json({ changes: this.changes });
        });
    });
});

app.post('/api/groups/:groupId/cycle/close', authenticateToken, (req, res) => {
    const groupId = req.params.groupId;
    requireGroupStaff(req, res, groupId, () => {
        requireOpenGroup(req, res, groupId, group => {
            recordHistory(groupId, req.user.id, 'Cycle clôturé', historyErr => {
                if (historyErr) return res.status(500).json({ error: historyErr.message });
                res.status(201).json({ closed: true, cycleLength: group.cycle_length });
            });
        });
    });
});

app.post('/api/groups/:groupId/cycle/distribute', authenticateToken, (req, res) => {
    const groupId = req.params.groupId;
    requireGroupStaff(req, res, groupId, () => {
        requireOpenGroup(req, res, groupId, group => {
            db.all(
                'SELECT id, cycle_contribution FROM members WHERE group_id = ? AND cycle_contribution > 0',
                [groupId],
                (membersErr, cycleMembers) => {
                    if (membersErr) return res.status(500).json({ error: membersErr.message });
                    const totalContribution = cycleMembers.reduce((total, member) => total + Number(member.cycle_contribution), 0);
                    if (!cycleMembers.length || totalContribution <= 0 || Number(group.wallet) <= 0) {
                        return res.status(400).json({ error: 'Aucune contribution de cycle à partager' });
                    }

                    db.serialize(() => {
                        db.run('BEGIN IMMEDIATE', beginErr => {
                            if (beginErr) return res.status(500).json({ error: beginErr.message });
                            let remaining = Number(group.wallet);
                            const distributeMember = index => {
                                if (index === cycleMembers.length) {
                                    return db.run('UPDATE groups SET wallet = 0 WHERE id = ? AND blocked = 0', [groupId], function updateGroup(groupUpdateErr) {
                                        if (groupUpdateErr || !this.changes) {
                                            db.run('ROLLBACK');
                                            return res.status(groupUpdateErr ? 500 : 403).json({ error: groupUpdateErr ? groupUpdateErr.message : 'Les opérations du groupe sont temporairement bloquées' });
                                        }
                                        recordHistory(groupId, req.user.id, 'Partage du cycle effectué', historyErr => {
                                            if (historyErr) {
                                                db.run('ROLLBACK');
                                                return res.status(500).json({ error: historyErr.message });
                                            }
                                            db.run('COMMIT', commitErr => {
                                                if (commitErr) return res.status(500).json({ error: commitErr.message });
                                                res.status(201).json({ distributed: Number(group.wallet), members: cycleMembers.length });
                                            });
                                        });
                                    });
                                }
                                const member = cycleMembers[index];
                                const share = index === cycleMembers.length - 1
                                    ? remaining
                                    : Math.floor((Number(group.wallet) * Number(member.cycle_contribution) / totalContribution) * 100) / 100;
                                remaining -= share;
                                db.run(
                                    'UPDATE members SET wallet = wallet + ?, cycle_contribution = 0 WHERE id = ?',
                                    [share, member.id],
                                    updateErr => {
                                        if (updateErr) {
                                            db.run('ROLLBACK');
                                            return res.status(500).json({ error: updateErr.message });
                                        }
                                        distributeMember(index + 1);
                                    }
                                );
                            };
                            distributeMember(0);
                        });
                    });
                }
            );
        });
    });
});

app.get('/api/members', authenticateToken, authorizeRole(['plateforme']), (req, res) => {
    db.all('SELECT m.*, g.name AS group_name FROM members m LEFT JOIN groups g ON m.group_id = g.id', [], (err, rows) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        res.json(rows.map(memberResponse));
    });
});

app.get('/api/members/:memberId', authenticateToken, (req, res) => {
    requireMemberAccess(req, res, req.params.memberId, false, member => {
        res.json(memberResponse(member));
    });
});

app.post('/api/members', authenticateToken, (req, res) => {
    return res.status(410).json({
        error: 'La création directe de membre est retirée. Recherchez un compte plateforme actif puis envoyez une invitation, ou approuvez une demande.'
    });
});

app.put('/api/members/:memberId/profile', authenticateToken, (req, res) => {
    requireMemberAccess(req, res, req.params.memberId, false, member => {
        if (String(req.user.id) !== String(member.id)) {
            return res.status(403).json({ error: 'Vous ne pouvez modifier que votre profil' });
        }

        const prenom = String(req.body.prenom || '').trim();
        const name = String(req.body.name || '').trim();
        const phone = String(req.body.phone || '').trim();
        const availability = req.body.availability === undefined
            ? member.availability || 'offline'
            : String(req.body.availability).trim();
        if (!prenom || !name || !phone) {
            return res.status(400).json({ error: 'Prénom, nom et téléphone requis' });
        }
        if (!AVAILABILITY_VALUES.includes(availability)) {
            return res.status(400).json({ error: 'Disponibilité invalide' });
        }

        db.run(
            'UPDATE members SET prenom = ?, name = ?, phone = ?, availability = ? WHERE id = ?',
            [prenom, name, phone, availability, member.id],
            function updateProfile(err) {
                if (err) {
                    return res.status(500).json({ error: err.message });
                }
                res.json({ changes: this.changes });
            }
        );
    });
});

app.put('/api/members/:memberId/pin', authenticateToken, authorizeRole(['plateforme']), (req, res) => {
    const pin = String(req.body.pin || '');
    if (!/^\d{4}$/.test(pin)) {
        return res.status(400).json({ error: 'Le PIN doit contenir exactement 4 chiffres' });
    }

    db.run('UPDATE members SET pin = ? WHERE id = ?', [bcrypt.hashSync(pin, 10), req.params.memberId], function resetPin(err) {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        if (!this.changes) {
            return res.status(404).json({ error: 'Membre introuvable' });
        }
        res.json({ changes: this.changes });
    });
});

function requireOpenGroup(req, res, groupId, next) {
    getGroup(groupId, (err, group) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        if (!group) {
            return res.status(404).json({ error: 'Groupe introuvable' });
        }
        if (group.blocked) {
            return res.status(403).json({ error: 'Les opérations du groupe sont temporairement bloquées' });
        }
        next(group);
    });
}

function requireFinancialMember(req, res, memberId, next) {
    requireMemberAccess(req, res, memberId, false, member => {
        if (!hasGroupAccess(req.user, member.group_id)) {
            return res.status(403).json({ error: 'Accès refusé pour ce groupe' });
        }
        requireOpenGroup(req, res, member.group_id, group => next(member, group));
    });
}

function resolveSandboxPaymentRequest(req, res, next) {
    const memberId = req.body.member_id || req.user.id;
    const amountMinor = validMinorAmount(req.body.amount_minor);
    const provider = normalizePaymentProvider(req.body.provider);
    if (!amountMinor || !provider) {
        return res.status(400).json({ error: 'amount_minor entier positif et fournisseur mtn, orange, airtel ou vodacom requis' });
    }
    requireMemberAccess(req, res, memberId, false, member => {
        if (!hasGroupAccess(req.user, member.group_id)) {
            return res.status(403).json({ error: 'Accès refusé pour ce groupe' });
        }
        requireOpenGroup(req, res, member.group_id, group => {
            const destinationPhone = req.body.phone || member.phone || group.phone;
            const selection = validMomoSelection(group.country, provider, destinationPhone);
            if (!selection) {
                return res.status(400).json({ error: 'Fournisseur, pays du groupe ou numéro de portefeuille invalide' });
            }
            next({
                member,
                group,
                amountMinor,
                provider,
                destinationPhone: selection.normalizedPhone
            });
        });
    });
}

app.post('/api/payments/intents', authenticateToken, replayPaymentIdempotency, (req, res) => {
    const type = String(req.body.type || '').trim();
    if (!['collection', 'loan_disbursement'].includes(type)) {
        return res.status(400).json({ error: 'Type de paiement invalide' });
    }

    resolveSandboxPaymentRequest(req, res, request => {
        beginIdempotentMutation(req, res, `payment_intent:${type}`, (idempotencyKey, respond) => {
            if (type === 'collection') {
                return createSandboxTransfer({
                    direction: 'collection',
                    transactionType: 'collection',
                    groupId: request.group.id,
                    memberId: request.member.id,
                    actorMemberId: req.user.id,
                    amountMinor: request.amountMinor,
                    currency: request.group.currency,
                    provider: request.provider,
                    idempotencyKey
                }, (transferErr, transfer) => {
                    if (transferErr) return respond(500, { error: transferErr.message });
                    respond(201, transfer);
                });
            }

            db.run(
                `INSERT INTO payment_operations
                 (operation_id, group_id, member_id, operation_type, amount_minor, currency, provider, destination_phone, status, requested_by_member_id, metadata_json)
                 VALUES (?, ?, ?, 'loan_disbursement', ?, ?, ?, ?, 'pending_approval', ?, ?)`,
                [newSecureId(), request.group.id, request.member.id, request.amountMinor, request.group.currency,
                    request.provider.toLowerCase(), request.destinationPhone, req.user.id, json({ sandbox: true })],
                function createLoanOperation(operationErr) {
                    if (operationErr) return respond(500, { error: operationErr.message });
                    const operationId = this.lastID;
                    db.run(
                        `INSERT INTO payment_events
                         (event_record_id, group_id, provider, event_type, status, payload_json, actor_member_id)
                         VALUES (?, ?, ?, 'loan_disbursement_requested', 'pending_approval', ?, ?)`,
                        [newSecureId(), request.group.id, request.provider.toLowerCase(), json({ operation_id: operationId, sandbox: true }), req.user.id],
                        eventErr => {
                            if (eventErr) return respond(500, { error: eventErr.message });
                            auditFinancialChange({
                                operationId: String(operationId),
                                groupId: request.group.id,
                                actorMemberId: req.user.id,
                                action: 'loan_disbursement_requested',
                                details: { sandbox: true, amount_minor: request.amountMinor }
                            }, auditErr => {
                                if (auditErr) return respond(500, { error: auditErr.message });
                                respond(202, { operation_id: operationId, status: 'pending_approval', sandbox: true });
                            });
                        }
                    );
                }
            );
        });
    });
});

app.post('/api/payment-operations/:operationId/approve', authenticateToken, replayPaymentIdempotency, (req, res) => {
    if (!/^\d+$/.test(String(req.params.operationId))) {
        return res.status(400).json({ error: 'Identifiant d’opération invalide' });
    }
    beginIdempotentMutation(req, res, 'loan_approval', (idempotencyKey, respond) => {
        db.get('SELECT * FROM payment_operations WHERE id = ?', [req.params.operationId], (operationErr, operation) => {
            if (operationErr) return respond(500, { error: operationErr.message });
            if (!operation) return respond(404, { error: 'Opération introuvable' });
            if (!hasGroupAccess(req.user, operation.group_id) || (!isPlatform(req.user) && !isGroupStaff(req.user))) {
                return respond(403, { error: 'Président ou personnel autorisé requis pour approuver un prêt' });
            }
            if (String(req.user.id) === String(operation.requested_by_member_id)) {
                return respond(403, { error: 'Le demandeur ne peut pas approuver son propre décaissement' });
            }
            if (operation.status !== 'pending_approval') {
                return respond(409, { error: 'Cette opération a déjà été traitée', status: operation.status });
            }
            requireOpenGroup(req, res, operation.group_id, group => {
                db.run(
                    `UPDATE payment_operations
                     SET status = 'approved', approved_by_member_id = ?, updated_at = CURRENT_TIMESTAMP
                     WHERE id = ? AND status = 'pending_approval'`,
                    [req.user.id, operation.id],
                    function markApproved(updateErr) {
                        if (updateErr) return respond(500, { error: updateErr.message });
                        if (!this.changes) return respond(409, { error: 'Cette opération a déjà été traitée' });
                        auditFinancialChange({
                            operationId: String(operation.id),
                            groupId: operation.group_id,
                            actorMemberId: req.user.id,
                            action: 'loan_disbursement_approved',
                            details: { sandbox: true }
                        }, auditErr => {
                            if (auditErr) return respond(500, { error: auditErr.message });
                            createSandboxTransfer({
                                direction: 'disbursement',
                                transactionType: 'loan_disbursement',
                                groupId: operation.group_id,
                                memberId: operation.member_id,
                                actorMemberId: req.user.id,
                                amountMinor: operation.amount_minor,
                                currency: operation.currency || group.currency,
                                provider: normalizePaymentProvider(operation.provider),
                                idempotencyKey,
                                operationId: String(operation.id)
                            }, (transferErr, transfer) => {
                                if (transferErr) return respond(500, { error: transferErr.message });
                                db.run(
                                    `UPDATE payment_operations
                                     SET status = 'disbursed', transaction_id = ?, updated_at = CURRENT_TIMESTAMP
                                     WHERE id = ?`,
                                    [transfer.transaction_id, operation.id],
                                    disburseErr => {
                                        if (disburseErr) return respond(500, { error: disburseErr.message });
                                        auditFinancialChange({
                                            transactionId: transfer.transaction_id,
                                            operationId: String(operation.id),
                                            groupId: operation.group_id,
                                            actorMemberId: req.user.id,
                                            action: 'loan_disbursement_completed',
                                            details: { sandbox: true }
                                        }, auditErr2 => {
                                            if (auditErr2) return respond(500, { error: auditErr2.message });
                                            respond(201, { ...transfer, operation_id: operation.id, sandbox: true });
                                        });
                                    }
                                );
                            });
                        });
                    }
                );
            });
        });
    });
});

app.get('/api/payments', authenticateToken, (req, res) => {
    const groupId = isPlatform(req.user) ? req.query.group_id : req.user.groupId;
    if (!groupId && !isPlatform(req.user)) return res.status(400).json({ error: 'Groupe introuvable' });
    const memberFilter = !isPlatform(req.user) && !isGroupStaff(req.user) ? req.user.id : null;
    const conditions = [];
    const values = [];
    if (groupId) {
        conditions.push('l.group_id = ?');
        values.push(groupId);
    }
    if (memberFilter) {
        conditions.push('l.member_id = ?');
        values.push(memberFilter);
    }
    db.all(
        `SELECT l.transaction_id, l.group_id, l.member_id, l.transaction_type, l.amount_minor, l.currency,
                l.status, l.provider, l.external_reference, l.created_at, l.updated_at
         FROM financial_ledger l${conditions.length ? ` WHERE ${conditions.join(' AND ')}` : ''}
         ORDER BY l.created_at DESC, l.id DESC LIMIT 200`,
        values,
        (err, rows) => err ? res.status(500).json({ error: err.message }) : res.json({ sandbox: true, payments: rows })
    );
});

app.get('/api/payments/:transactionId', authenticateToken, (req, res) => {
    db.get('SELECT * FROM financial_ledger WHERE transaction_id = ?', [req.params.transactionId], (err, payment) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!payment) return res.status(404).json({ error: 'Paiement introuvable' });
        if (!hasGroupAccess(req.user, payment.group_id) ||
            (!isPlatform(req.user) && !isGroupStaff(req.user) && String(req.user.id) !== String(payment.member_id))) {
            return res.status(403).json({ error: 'Accès refusé à ce paiement' });
        }
        db.all(
            `SELECT event_record_id, event_type, status, provider_event_id, created_at
             FROM payment_events WHERE transaction_id = ? ORDER BY created_at ASC, id ASC`,
            [payment.transaction_id],
            (eventErr, events) => eventErr
                ? res.status(500).json({ error: eventErr.message })
                : res.json({ sandbox: true, payment, events })
        );
    });
});

app.get('/api/payment-operations', authenticateToken, (req, res) => {
    const groupId = isPlatform(req.user) ? req.query.group_id : req.user.groupId;
    if (!groupId && !isPlatform(req.user)) return res.status(400).json({ error: 'Groupe introuvable' });
    const memberFilter = !isPlatform(req.user) && !isGroupStaff(req.user) ? req.user.id : null;
    const conditions = [];
    const values = [];
    if (groupId) {
        conditions.push('group_id = ?');
        values.push(groupId);
    }
    if (memberFilter) {
        conditions.push('member_id = ?');
        values.push(memberFilter);
    }
    db.all(
        `SELECT id, operation_id, group_id, member_id, operation_type, amount_minor, currency, provider,
                status, transaction_id, created_at, updated_at
         FROM payment_operations${conditions.length ? ` WHERE ${conditions.join(' AND ')}` : ''}
         ORDER BY created_at DESC, id DESC LIMIT 200`,
        values,
        (err, rows) => err ? res.status(500).json({ error: err.message }) : res.json({ sandbox: true, operations: rows })
    );
});

app.post('/api/members/:memberId/contributions', authenticateToken, (req, res) => {
    const amount = validAmount(req.body.amount);
    if (!amount) {
        return res.status(400).json({ error: 'Montant de contribution invalide' });
    }

    requireFinancialMember(req, res, req.params.memberId, (member, group) => {
        db.serialize(() => {
            db.run('BEGIN IMMEDIATE', beginErr => {
                if (beginErr) return res.status(500).json({ error: beginErr.message });
                db.run(
                    'UPDATE members SET contribution = contribution + ?, cycle_contribution = cycle_contribution + ? WHERE id = ?',
                    [amount, amount, member.id],
                    updateMemberErr => {
                        if (updateMemberErr) {
                            db.run('ROLLBACK');
                            return res.status(500).json({ error: updateMemberErr.message });
                        }
                        db.run('UPDATE groups SET wallet = wallet + ? WHERE id = ? AND blocked = 0', [amount, group.id], function updateGroup(updateGroupErr) {
                            if (updateGroupErr || !this.changes) {
                                db.run('ROLLBACK');
                                return res.status(updateGroupErr ? 500 : 403).json({ error: updateGroupErr ? updateGroupErr.message : 'Les opérations du groupe sont temporairement bloquées' });
                            }
                            recordHistory(group.id, member.id, `Contribution de ${amount}`, historyErr => {
                                if (historyErr) {
                                    db.run('ROLLBACK');
                                    return res.status(500).json({ error: historyErr.message });
                                }
                                db.run('COMMIT', commitErr => {
                                    if (commitErr) return res.status(500).json({ error: commitErr.message });
                                    res.status(201).json({ amount });
                                });
                            });
                        });
                    }
                );
            });
        });
    });
});

app.post('/api/members/:memberId/credit-request', authenticateToken, (req, res) => {
    const amount = validAmount(req.body.amount);
    const reason = String(req.body.reason || '').trim().slice(0, 500);
    if (!amount || !reason) {
        return res.status(400).json({ error: 'Montant et motif du crédit requis' });
    }

    requireFinancialMember(req, res, req.params.memberId, (member, group) => {
        const request = JSON.stringify({ amount, reason, requestedAt: new Date().toISOString(), status: 'en_attente' });
        db.run(
            `UPDATE members SET credit_request = ? WHERE id = ?
             AND EXISTS (SELECT 1 FROM groups WHERE id = ? AND blocked = 0)`,
            [request, member.id, group.id],
            function updateCreditRequest(updateErr) {
                if (updateErr) return res.status(500).json({ error: updateErr.message });
                if (!this.changes) return res.status(403).json({ error: 'Les opérations du groupe sont temporairement bloquées' });
            recordHistory(group.id, member.id, `Demande de crédit de ${amount}`, historyErr => {
                if (historyErr) return res.status(500).json({ error: historyErr.message });
                res.status(201).json({ amount, status: 'en_attente' });
            });
            }
        );
    });
});

app.post('/api/members/:memberId/repayments', authenticateToken, (req, res) => {
    const amount = validAmount(req.body.amount);
    if (!amount) {
        return res.status(400).json({ error: 'Montant de remboursement invalide' });
    }

    requireFinancialMember(req, res, req.params.memberId, (member, group) => {
        db.serialize(() => {
            db.run('BEGIN IMMEDIATE', beginErr => {
                if (beginErr) return res.status(500).json({ error: beginErr.message });
                db.run(
                    'UPDATE members SET credit = credit - ?, repayment = repayment + ? WHERE id = ? AND credit >= ?',
                    [amount, amount, member.id, amount],
                    function updateMember(updateErr) {
                        if (updateErr) {
                            db.run('ROLLBACK');
                            return res.status(500).json({ error: updateErr.message });
                        }
                        if (!this.changes) {
                            db.run('ROLLBACK');
                            return res.status(400).json({ error: 'Le remboursement dépasse le crédit restant' });
                        }
                        db.run('UPDATE groups SET wallet = wallet + ? WHERE id = ? AND blocked = 0', [amount, group.id], function updateGroup(updateGroupErr) {
                            if (updateGroupErr || !this.changes) {
                                db.run('ROLLBACK');
                                return res.status(updateGroupErr ? 500 : 403).json({ error: updateGroupErr ? updateGroupErr.message : 'Les opérations du groupe sont temporairement bloquées' });
                            }
                            recordHistory(group.id, member.id, `Remboursement de ${amount}`, historyErr => {
                                if (historyErr) {
                                    db.run('ROLLBACK');
                                    return res.status(500).json({ error: historyErr.message });
                                }
                                db.run('COMMIT', commitErr => {
                                    if (commitErr) return res.status(500).json({ error: commitErr.message });
                                    res.status(201).json({ amount });
                                });
                            });
                        });
                    }
                );
            });
        });
    });
});

app.post('/api/members/:memberId/withdrawals', authenticateToken, (req, res) => {
    const amount = validAmount(req.body.amount);
    if (!amount) {
        return res.status(400).json({ error: 'Montant de retrait invalide' });
    }

    requireFinancialMember(req, res, req.params.memberId, (member, group) => {
        const today = new Date().toISOString().slice(0, 10);
        db.serialize(() => {
            db.run('BEGIN IMMEDIATE', beginErr => {
                if (beginErr) return res.status(500).json({ error: beginErr.message });
                db.run(
                    `UPDATE members
                     SET wallet = wallet - ?, withdrawals_count = CASE WHEN withdrawals_date = ? THEN withdrawals_count + 1 ELSE 1 END,
                         withdrawals_date = ?
                     WHERE id = ? AND wallet >= ? AND (withdrawals_date <> ? OR withdrawals_count < 2)`,
                    [amount, today, today, member.id, amount, today],
                    function updateMember(updateErr) {
                        if (updateErr) {
                            db.run('ROLLBACK');
                            return res.status(500).json({ error: updateErr.message });
                        }
                        if (!this.changes) {
                            db.run('ROLLBACK');
                            return res.status(400).json({ error: 'Solde insuffisant ou limite quotidienne de deux retraits atteinte' });
                        }
                        db.run('UPDATE groups SET wallet = wallet - ? WHERE id = ? AND wallet >= ? AND blocked = 0', [amount, group.id, amount], function updateGroup(groupErr) {
                            if (groupErr || !this.changes) {
                                db.run('ROLLBACK');
                                return res.status(groupErr ? 500 : 400).json({ error: groupErr ? groupErr.message : 'Solde du groupe insuffisant ou opérations bloquées' });
                            }
                            recordHistory(group.id, member.id, `Retrait de ${amount}`, historyErr => {
                                if (historyErr) {
                                    db.run('ROLLBACK');
                                    return res.status(500).json({ error: historyErr.message });
                                }
                                db.run('COMMIT', commitErr => {
                                    if (commitErr) return res.status(500).json({ error: commitErr.message });
                                    res.status(201).json({ amount });
                                });
                            });
                        });
                    }
                );
            });
        });
    });
});

app.post('/api/members/:memberId/fraud-reports', authenticateToken, (req, res) => {
    const details = String(req.body.details || '').trim().slice(0, 500);
    if (!details) {
        return res.status(400).json({ error: 'Description du signalement requise' });
    }

    requireMemberAccess(req, res, req.params.memberId, false, member => {
        if (!hasGroupAccess(req.user, member.group_id)) {
            return res.status(403).json({ error: 'Accès refusé pour ce groupe' });
        }
        if (!isPlatform(req.user) && String(req.user.id) !== String(member.id)) {
            return res.status(403).json({ error: 'Vous ne pouvez signaler une fraude qu’en votre nom' });
        }

        const groupId = member.group_id;
        const notification = 'Alerte de sécurité : une fraude a été signalée. Le groupe est bloqué et les opérations financières sont suspendues jusqu’à réactivation par la plateforme.';
        db.serialize(() => {
            db.run('BEGIN IMMEDIATE', beginErr => {
                if (beginErr) return res.status(500).json({ error: beginErr.message });
                db.run('UPDATE groups SET blocked = 1 WHERE id = ?', [groupId], function blockGroup(blockErr) {
                    if (blockErr || !this.changes) {
                        db.run('ROLLBACK');
                        return res.status(blockErr ? 500 : 404).json({ error: blockErr ? blockErr.message : 'Groupe introuvable' });
                    }
                    db.run(
                        'INSERT INTO fraud_reports (group_id, reporter_member_id, details) VALUES (?, ?, ?)',
                        [groupId, member.id, details],
                        fraudErr => {
                            if (fraudErr) {
                                db.run('ROLLBACK');
                                return res.status(500).json({ error: fraudErr.message });
                            }
                            recordHistory(groupId, member.id, `Fraude signalée: ${details}`, fraudHistoryErr => {
                                if (fraudHistoryErr) {
                                    db.run('ROLLBACK');
                                    return res.status(500).json({ error: fraudHistoryErr.message });
                                }
                                recordHistory(groupId, member.id, 'Groupe bloqué automatiquement après signalement de fraude', blockHistoryErr => {
                                    if (blockHistoryErr) {
                                        db.run('ROLLBACK');
                                        return res.status(500).json({ error: blockHistoryErr.message });
                                    }
                                    db.run(
                                        'INSERT INTO chat_messages (group_id, sender, message, recipient) VALUES (?, ?, ?, ?)',
                                        [groupId, String(member.id), notification, 'all'],
                                        chatErr => {
                                            if (chatErr) {
                                                db.run('ROLLBACK');
                                                return res.status(500).json({ error: chatErr.message });
                                            }
                                            db.run('COMMIT', commitErr => {
                                                if (commitErr) return res.status(500).json({ error: commitErr.message });
                                                res.status(201).json({ reported: true, blocked: true });
                                            });
                                        }
                                    );
                                });
                            });
                        }
                    );
                });
            });
        });
    });
});

app.post('/api/groups/:groupId/review-requests', authenticateToken, (req, res) => {
    const groupId = req.params.groupId;
    const message = String(req.body.message || '').trim().slice(0, 500);
    if (!message) return res.status(400).json({ error: 'Le message de demande de révision est requis' });
    if (req.user.role !== 'president' || String(req.user.groupId) !== String(groupId)) {
        return res.status(403).json({ error: 'Seul le président du groupe peut demander une révision' });
    }

    getGroup(groupId, (groupErr, group) => {
        if (groupErr) return res.status(500).json({ error: groupErr.message });
        if (!group) return res.status(404).json({ error: 'Groupe introuvable' });
        if (!group.blocked) return res.status(400).json({ error: 'Une révision est possible uniquement pour un groupe bloqué' });

        db.serialize(() => {
            db.run('BEGIN IMMEDIATE', beginErr => {
                if (beginErr) return res.status(500).json({ error: beginErr.message });
                db.run(
                    'INSERT INTO review_requests (group_id, requester_member_id, message) VALUES (?, ?, ?)',
                    [groupId, req.user.id, message],
                    function insertReview(reviewErr) {
                        if (reviewErr) {
                            db.run('ROLLBACK');
                            return res.status(500).json({ error: reviewErr.message });
                        }
                        const chatMessage = `Demande de révision du président : ${message}`;
                        db.run(
                            'INSERT INTO chat_messages (group_id, sender, message, recipient) VALUES (?, ?, ?, ?)',
                            [groupId, String(req.user.id), chatMessage, 'platform'],
                            chatErr => {
                                if (chatErr) {
                                    db.run('ROLLBACK');
                                    return res.status(500).json({ error: chatErr.message });
                                }
                                recordHistory(groupId, req.user.id, 'Demande de révision envoyée à la plateforme', historyErr => {
                                    if (historyErr) {
                                        db.run('ROLLBACK');
                                        return res.status(500).json({ error: historyErr.message });
                                    }
                                    db.run('COMMIT', commitErr => {
                                        if (commitErr) return res.status(500).json({ error: commitErr.message });
                                        res.status(201).json({ id: this.lastID, status: 'pending' });
                                    });
                                });
                            }
                        );
                    }
                );
            });
        });
    });
});

app.get('/api/platform-conversations', authenticateToken, (req, res) => {
    db.get('SELECT role FROM members WHERE id = ?', [req.user.id], (actorErr, actor) => {
        if (actorErr) return res.status(500).json({ error: actorErr.message });
        if (!actor || actor.role !== 'plateforme') return res.status(403).json({ error: 'Administrateur plateforme requis' });

        db.all(
            `SELECT g.id, g.name, g.country,
                    p.id AS president_id, p.prenom AS president_prenom, p.name AS president_name,
                    COUNT(c.id) AS message_count, MAX(c.date) AS last_message_at
             FROM groups g
             JOIN members p ON p.id = (
                 SELECT id FROM members
                 WHERE group_id = g.id AND role = 'president'
                 ORDER BY id ASC LIMIT 1
             )
             LEFT JOIN chat_messages c ON c.group_id = g.id AND c.conversation_type = 'platform_president'
             GROUP BY g.id, g.name, g.country, p.id, p.prenom, p.name
             ORDER BY COALESCE(MAX(c.date), g.created_at) DESC, g.name COLLATE NOCASE ASC`,
            [],
            (err, rows) => {
                if (err) return res.status(500).json({ error: err.message });
                res.json(rows);
            }
        );
    });
});

app.get('/api/platform-conversations/:groupId', authenticateToken, (req, res) => {
    const groupId = req.params.groupId;
    requirePlatformConversationAccess(req, res, groupId, (group, actor) => {
        db.get(
            `SELECT id, prenom, name FROM members
             WHERE group_id = ? AND role = 'president' ORDER BY id ASC LIMIT 1`,
            [group.id],
            (presidentErr, president) => {
                if (presidentErr) return res.status(500).json({ error: presidentErr.message });
                if (!president) return res.status(404).json({ error: 'Aucun président n’est défini pour ce groupe' });

                db.all(
                    `SELECT c.id, c.group_id, c.sender, c.sender_member_id, c.message, c.conversation_type, c.date,
                            m.prenom, m.name, m.role
                     FROM chat_messages c
                     LEFT JOIN members m ON m.id = c.sender_member_id
                     WHERE c.group_id = ? AND c.conversation_type = 'platform_president'
                     ORDER BY c.date ASC, c.id ASC LIMIT 200`,
                    [group.id],
                    (messagesErr, messages) => {
                        if (messagesErr) return res.status(500).json({ error: messagesErr.message });
                        res.json({
                            group: { id: group.id, name: group.name, country: group.country },
                            president,
                            viewer_role: actor.role,
                            messages
                        });
                    }
                );
            }
        );
    });
});

app.post('/api/platform-conversations/:groupId', authenticateToken, (req, res) => {
    const groupId = req.params.groupId;
    const message = normalizeMessage(req.body.message);
    if (!message) {
        return res.status(400).json({ error: 'Le message est requis et doit contenir au plus 1 000 caractères' });
    }

    requirePlatformConversationAccess(req, res, groupId, (group, actor) => {
        db.get(
            `SELECT id FROM members WHERE group_id = ? AND role = 'president' ORDER BY id ASC LIMIT 1`,
            [group.id],
            (presidentErr, president) => {
                if (presidentErr) return res.status(500).json({ error: presidentErr.message });
                if (!president) return res.status(404).json({ error: 'Aucun président n’est défini pour ce groupe' });

                const recipient = actor.role === 'plateforme' ? String(president.id) : 'platform';
                db.run(
                    `INSERT INTO chat_messages
                     (group_id, sender, sender_member_id, message, recipient, conversation_type)
                     VALUES (?, ?, ?, ?, ?, 'platform_president')`,
                    [group.id, String(actor.id), actor.id, message, recipient],
                    function addPlatformMessage(err) {
                        if (err) return res.status(500).json({ error: err.message });
                        res.status(201).json({ id: this.lastID, conversation_type: 'platform_president' });
                    }
                );
            }
        );
    });
});

app.get('/api/review-requests', authenticateToken, authorizeRole(['plateforme']), (req, res) => {
    db.all(
        `SELECT r.*, g.name AS group_name, g.country, g.blocked,
                m.prenom AS requester_prenom, m.name AS requester_name
         FROM review_requests r
         JOIN groups g ON g.id = r.group_id
         JOIN members m ON m.id = r.requester_member_id
         ORDER BY CASE r.status WHEN 'pending' THEN 0 ELSE 1 END, r.created_at DESC`,
        [],
        (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json(rows);
        }
    );
});

app.get('/api/blocked-groups', authenticateToken, authorizeRole(['plateforme']), (req, res) => {
    db.all(
        `SELECT g.id, g.name, g.country, g.momo_provider, g.phone, g.created_at,
                f.details AS latest_fraud_details, f.created_at AS fraud_reported_at
         FROM groups g
         LEFT JOIN fraud_reports f ON f.id = (
             SELECT id FROM fraud_reports WHERE group_id = g.id ORDER BY created_at DESC, id DESC LIMIT 1
         )
         WHERE g.blocked = 1
         ORDER BY fraud_reported_at DESC, g.created_at DESC`,
        [],
        (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json(rows);
        }
    );
});

app.post('/api/groups/:groupId/reactivate', authenticateToken, authorizeRole(['plateforme']), (req, res) => {
    const groupId = req.params.groupId;
    const notification = 'Le groupe a été réactivé par la plateforme. Les opérations financières peuvent reprendre.';
    db.serialize(() => {
        db.run('BEGIN IMMEDIATE', beginErr => {
            if (beginErr) return res.status(500).json({ error: beginErr.message });
            db.get('SELECT id, blocked FROM groups WHERE id = ?', [groupId], (groupErr, group) => {
                if (groupErr || !group) {
                    db.run('ROLLBACK');
                    return res.status(groupErr ? 500 : 404).json({ error: groupErr ? groupErr.message : 'Groupe introuvable' });
                }
                if (!group.blocked) {
                    db.run('ROLLBACK');
                    return res.status(400).json({ error: 'Ce groupe est déjà actif' });
                }
                db.run('UPDATE groups SET blocked = 0 WHERE id = ?', [groupId], updateErr => {
                    if (updateErr) {
                        db.run('ROLLBACK');
                        return res.status(500).json({ error: updateErr.message });
                    }
                    db.run(
                        `UPDATE review_requests
                         SET status = 'resolved', resolved_at = CURRENT_TIMESTAMP, resolved_by_member_id = ?
                         WHERE group_id = ? AND status = 'pending'`,
                        [req.user.id, groupId],
                        reviewErr => {
                            if (reviewErr) {
                                db.run('ROLLBACK');
                                return res.status(500).json({ error: reviewErr.message });
                            }
                            recordHistory(groupId, req.user.id, 'Groupe réactivé par la plateforme', historyErr => {
                                if (historyErr) {
                                    db.run('ROLLBACK');
                                    return res.status(500).json({ error: historyErr.message });
                                }
                                db.run(
                                    'INSERT INTO chat_messages (group_id, sender, message, recipient) VALUES (?, ?, ?, ?)',
                                    [groupId, String(req.user.id), notification, 'all'],
                                    chatErr => {
                                        if (chatErr) {
                                            db.run('ROLLBACK');
                                            return res.status(500).json({ error: chatErr.message });
                                        }
                                        db.run('COMMIT', commitErr => {
                                            if (commitErr) return res.status(500).json({ error: commitErr.message });
                                            res.json({ reactivated: true });
                                        });
                                    }
                                );
                            });
                        }
                    );
                });
            });
        });
    });
});

app.put('/api/members/:memberId', authenticateToken, (req, res) => {
    requireMemberAccess(req, res, req.params.memberId, true, member => {
        if (Object.prototype.hasOwnProperty.call(req.body, 'role')) {
            return res.status(403).json({ error: 'Un rôle de personnel ne peut être attribué que par une élection clôturée.' });
        }
        const allowedFields = [
            'prenom', 'name', 'phone', 'id_number', 'parrain', 'wallet',
            'contribution', 'cycle_contribution', 'credit', 'interest', 'repayment',
            'withdrawals_date', 'withdrawals_count', 'credit_request'
        ];
        const updates = Object.entries(req.body).filter(([key]) => allowedFields.includes(key));
        if (req.body.idNumber !== undefined) {
            updates.push(['id_number', req.body.idNumber]);
        }
        if (req.body.creditRequest !== undefined) {
            updates.push(['credit_request', JSON.stringify(req.body.creditRequest)]);
        }

        if (updates.length === 0) {
            return res.status(400).json({ error: 'Aucune modification autorisée fournie' });
        }
        const uniqueUpdates = new Map(updates);
        const fields = [...uniqueUpdates.keys()].map(key => `${key} = ?`).join(', ');
        const values = [...uniqueUpdates.values(), member.id];
        const financialFields = ['wallet', 'contribution', 'cycle_contribution', 'credit', 'interest', 'repayment'];
        const manualFinancialChanges = [...uniqueUpdates.entries()]
            .filter(([key]) => financialFields.includes(key))
            .map(([field, value]) => ({ field, value }));
        db.run(`UPDATE members SET ${fields} WHERE id = ?`, values, function updateMember(err) {
            if (err) {
                return res.status(500).json({ error: err.message });
            }
            if (!manualFinancialChanges.length || !this.changes) {
                return res.json({ changes: this.changes });
            }
            auditFinancialChange({
                groupId: member.group_id,
                actorMemberId: req.user.id,
                action: 'manual_member_financial_change',
                details: { member_id: member.id, changes: manualFinancialChanges }
            }, auditErr => {
                if (auditErr) return res.status(500).json({ error: auditErr.message });
                res.json({ changes: this.changes, audited: true });
            });
        });
    });
});

app.delete('/api/members/:memberId', authenticateToken, (req, res) => {
    requireMemberAccess(req, res, req.params.memberId, true, member => {
        db.run('DELETE FROM members WHERE id = ?', [member.id], function deleteMember(err) {
            if (err) {
                return res.status(500).json({ error: err.message });
            }
            res.json({ deleted: this.changes });
        });
    });
});

app.get('/api/momo', authenticateToken, authorizeRole(['plateforme']), (req, res) => {
    db.all('SELECT * FROM platform_momo ORDER BY country, provider', [], (err, rows) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        res.json(rows);
    });
});

app.get('/api/admin/deployment-settings', authenticateToken, authorizeRole(['plateforme']), (req, res) => {
    db.get('SELECT * FROM deployment_settings WHERE id = 1', [], (err, row) => {
        if (err) return res.status(500).json({ error: 'Impossible de lire les paramètres de déploiement.' });
        res.json(deploymentSettingsResponse(row));
    });
});

app.get('/api/admin/deployment-settings/history', authenticateToken, authorizeRole(['plateforme']), (req, res) => {
    db.all(
        `SELECT a.action, a.settings_json, a.created_at, m.prenom, m.name
         FROM deployment_settings_audit a JOIN members m ON m.id = a.actor_member_id
         ORDER BY a.id DESC LIMIT 50`,
        [],
        (err, rows) => {
            if (err) return res.status(500).json({ error: 'Impossible de lire l’historique de déploiement.' });
            res.json(rows.map(row => ({
                action: row.action,
                settings: parseStoredJson(row.settings_json, {}),
                createdAt: row.created_at,
                actor: `${row.prenom || ''} ${row.name || ''}`.trim() || 'Administrateur plateforme'
            })));
        }
    );
});

app.put('/api/admin/deployment-settings', authenticateToken, authorizeRole(['plateforme']), (req, res) => {
    const validation = validateDeploymentSettings(req.body);
    if (validation.error) return res.status(400).json({ error: validation.error });
    const settings = validation.value;
    db.serialize(() => {
        db.run(
            `INSERT INTO deployment_settings
             (id, public_base_url, allowed_origins_json, hosting_provider, sms_provider, video_provider,
              turn_urls_json, momo_providers_json, maintenance_mode, production_ready, backup_verified,
              sandbox_acknowledged, updated_by_member_id, updated_at)
             VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
             ON CONFLICT(id) DO UPDATE SET
              public_base_url = excluded.public_base_url,
              allowed_origins_json = excluded.allowed_origins_json,
              hosting_provider = excluded.hosting_provider,
              sms_provider = excluded.sms_provider,
              video_provider = excluded.video_provider,
              turn_urls_json = excluded.turn_urls_json,
              momo_providers_json = excluded.momo_providers_json,
              maintenance_mode = excluded.maintenance_mode,
              production_ready = excluded.production_ready,
              backup_verified = excluded.backup_verified,
              sandbox_acknowledged = excluded.sandbox_acknowledged,
              updated_by_member_id = excluded.updated_by_member_id,
              updated_at = CURRENT_TIMESTAMP`,
            [
                settings.publicBaseUrl, json(settings.allowedOrigins), settings.hostingProvider, settings.smsProvider,
                settings.videoProvider, json(settings.turnUrls), json(settings.momoProviders),
                Number(settings.maintenanceMode), Number(settings.productionReady), Number(settings.backupVerified),
                Number(settings.sandboxAcknowledged), req.user.id
            ],
            function saveDeploymentSettings(err) {
                if (err) return res.status(500).json({ error: 'Impossible d’enregistrer les paramètres de déploiement.' });
                db.run(
                    'INSERT INTO deployment_settings_audit (actor_member_id, action, settings_json) VALUES (?, ?, ?)',
                    [req.user.id, 'updated', json(settings)],
                    auditErr => {
                        if (auditErr) return res.status(500).json({ error: 'Impossible d’historiser les paramètres de déploiement.' });
                        db.get('SELECT * FROM deployment_settings WHERE id = 1', [], (readErr, row) => {
                            if (readErr) return res.status(500).json({ error: 'Impossible de relire les paramètres de déploiement.' });
                            res.json(deploymentSettingsResponse(row));
                        });
                    }
                );
            }
        );
    });
});

app.post('/api/momo', authenticateToken, authorizeRole(['plateforme']), (req, res) => {
    const { country, provider, description } = req.body;
    const phoneNumber = req.body.phone_number || req.body.phone;
    const momoSelection = validMomoSelection(country, provider, phoneNumber);
    if (!momoSelection) {
        return res.status(400).json({ error: 'Pays, opérateur ou numéro Momo invalide' });
    }

    db.run(
        'INSERT INTO platform_momo (country, provider, phone_number, currency, description) VALUES (?, ?, ?, ?, ?)',
        [country, provider, momoSelection.normalizedPhone, momoSelection.countryInfo.currency, description || null],
        function addMomo(err) {
            if (err) {
                if (err.code === 'SQLITE_CONSTRAINT') {
                    return res.status(409).json({ error: 'Un compte existe déjà pour ce pays et cet opérateur' });
                }
                return res.status(500).json({ error: err.message });
            }
            res.status(201).json({ id: this.lastID, country, provider, phone_number: momoSelection.normalizedPhone });
        }
    );
});

app.delete('/api/momo/:id', authenticateToken, authorizeRole(['plateforme']), (req, res) => {
    db.run('DELETE FROM platform_momo WHERE id = ?', [req.params.id], function deleteMomo(err) {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        res.json({ deleted: this.changes });
    });
});

app.get('/api/countries', (req, res) => {
    res.json(MOMO_COUNTRIES);
});

app.get('/api/stats', authenticateToken, (req, res) => {
    const groupId = isPlatform(req.user) ? null : req.user.groupId;
    if (!isPlatform(req.user) && !isGroupStaff(req.user)) {
        return res.status(403).json({ error: 'Droits d’administration requis' });
    }

    const query = groupId
        ? 'SELECT COUNT(*) AS count, SUM(wallet) AS totalWallet, SUM(contribution) AS totalContributions, SUM(credit) AS totalCredit FROM members WHERE group_id = ?'
        : 'SELECT COUNT(*) AS count, SUM(wallet) AS totalWallet, SUM(contribution) AS totalContributions, SUM(credit) AS totalCredit FROM members';
    db.get(query, groupId ? [groupId] : [], (err, stats) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        res.json({ stats: { ...stats, totalWallet: stats.totalWallet || 0, totalContributions: stats.totalContributions || 0, totalCredit: stats.totalCredit || 0 } });
    });
});

app.get('/api/stats/platform', authenticateToken, authorizeRole(['plateforme']), (req, res) => {
    db.get(
        `SELECT
            (SELECT COUNT(*) FROM groups) AS totalGroups,
            (SELECT COUNT(*) FROM members) AS totalMembers,
            (SELECT COALESCE(SUM(wallet), 0) FROM members) AS totalWallet,
            (SELECT COALESCE(SUM(credit), 0) FROM members) AS activeCredits,
            (SELECT COUNT(*) FROM groups WHERE blocked = 1) AS activeAlerts`,
        (err, stats) => {
            if (err) {
                return res.status(500).json({ error: err.message });
            }
            res.json(stats);
        }
    );
});

app.get('/api/alerts', authenticateToken, authorizeRole(['plateforme']), (req, res) => {
    db.all(
        `SELECT h.id, h.group_id, h.member_id, h.action AS message, h.date AS createdAt,
                m.name AS fromMember, 'fraude' AS type
         FROM history h
         LEFT JOIN members m ON m.id = h.member_id
         WHERE LOWER(h.action) LIKE '%fraude%'
         ORDER BY h.date DESC`,
        [],
        (err, rows) => {
            if (err) {
                return res.status(500).json({ error: err.message });
            }
            res.json(rows);
        }
    );
});

app.get('/api/history', authenticateToken, (req, res) => {
    const groupId = isPlatform(req.user) ? req.query.group_id : req.user.groupId;
    if (!groupId && !isPlatform(req.user)) {
        return res.status(400).json({ error: 'Groupe introuvable' });
    }

    let memberId = req.query.member_id;
    if (!isPlatform(req.user) && !isGroupStaff(req.user)) {
        memberId = req.user.id;
    }

    const conditions = [];
    const values = [];
    if (groupId) {
        conditions.push('group_id = ?');
        values.push(groupId);
    }
    if (memberId) {
        conditions.push('member_id = ?');
        values.push(memberId);
    }
    const query = `SELECT * FROM history${conditions.length ? ` WHERE ${conditions.join(' AND ')}` : ''} ORDER BY date DESC LIMIT 100`;
    db.all(query, values, (err, rows) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        res.json(rows);
    });
});

app.post('/api/history', authenticateToken, (req, res) => {
    const { group_id, member_id, action } = req.body;
    const groupId = isPlatform(req.user) ? group_id : req.user.groupId;
    if (!groupId || !action) {
        return res.status(400).json({ error: 'group_id and action required' });
    }

    requireGroupAccess(req, res, groupId, () => {
        const memberId = isPlatform(req.user) || isGroupStaff(req.user) ? member_id : req.user.id;
        if (!memberId) {
            return res.status(400).json({ error: 'member_id required' });
        }

        getMember(memberId, (err, member) => {
            if (err) {
                return res.status(500).json({ error: err.message });
            }
            if (!member || String(member.group_id) !== String(groupId)) {
                return res.status(403).json({ error: 'Membre invalide pour ce groupe' });
            }

            db.run('INSERT INTO history (group_id, member_id, action) VALUES (?, ?, ?)', [groupId, memberId, action], function addHistory(historyErr) {
                if (historyErr) {
                    return res.status(500).json({ error: historyErr.message });
                }
                res.status(201).json({ id: this.lastID });
            });
        });
    });
});

app.get('/api/chat/:groupId', authenticateToken, (req, res) => {
    const groupId = req.params.groupId;
    requireGroupAccess(req, res, groupId, () => {
        const query = isPlatform(req.user)
            ? `SELECT c.*, m.prenom, m.name, m.availability, a.id AS attachment_id, a.original_name AS attachment_name,
                      a.mime_type AS attachment_mime_type, a.size_bytes AS attachment_size_bytes
               FROM chat_messages c LEFT JOIN members m ON CAST(c.sender AS INTEGER) = m.id
               LEFT JOIN chat_attachments a ON a.message_id = c.id
               WHERE c.group_id = ? AND COALESCE(c.conversation_type, 'group') = 'group'
               ORDER BY c.date ASC LIMIT 200`
            : `SELECT c.*, m.prenom, m.name, m.availability, a.id AS attachment_id, a.original_name AS attachment_name,
                      a.mime_type AS attachment_mime_type, a.size_bytes AS attachment_size_bytes
               FROM chat_messages c LEFT JOIN members m ON CAST(c.sender AS INTEGER) = m.id
               LEFT JOIN chat_attachments a ON a.message_id = c.id
               WHERE c.group_id = ? AND COALESCE(c.conversation_type, 'group') = 'group'
               AND (c.recipient IS NULL OR c.recipient = 'all' OR c.recipient = ? OR c.sender = ?)
               ORDER BY c.date ASC LIMIT 200`;
        const values = isPlatform(req.user) ? [groupId] : [groupId, String(req.user.id), String(req.user.id)];
        db.all(query, values, (err, rows) => {
            if (err) {
                return res.status(500).json({ error: err.message });
            }
            hydrateChatRows(rows, res);
        });
    });
});

app.post('/api/chat', authenticateToken, (req, res) => {
    const { group_id, message, recipient, attachment_id: attachmentId } = req.body;
    const groupId = isPlatform(req.user) ? group_id : req.user.groupId;
    const text = typeof message === 'string' ? message.trim() : '';
    if (!groupId || (!text && !attachmentId)) {
        return res.status(400).json({ error: 'Un message ou une pièce jointe est requis' });
    }
    if (text.length > 1000) {
        return res.status(400).json({ error: 'Message trop long' });
    }

    requireGroupAccess(req, res, groupId, () => {
        const recipientId = recipient && recipient !== 'all' ? String(recipient) : 'all';
        const addMessage = attachment => db.run(
            `INSERT INTO chat_messages (group_id, sender, message, recipient, conversation_type)
             VALUES (?, ?, ?, ?, 'group')`,
            [groupId, String(req.user.id), text, recipientId],
            function addChatMessage(err) {
                if (err) {
                    return res.status(500).json({ error: err.message });
                }
                if (!attachment) return res.status(201).json({ id: this.lastID });
                db.run('UPDATE chat_attachments SET message_id = ? WHERE id = ? AND message_id IS NULL', [this.lastID, attachment.id], updateErr => {
                    if (updateErr) return res.status(500).json({ error: updateErr.message });
                    res.status(201).json({ id: this.lastID, attachment_id: attachment.id });
                });
            }
        );

        const withAttachment = callback => {
            if (!attachmentId) return callback(null);
            if (!/^\d+$/.test(String(attachmentId))) return res.status(400).json({ error: 'Pièce jointe invalide' });
            db.get(
                'SELECT id FROM chat_attachments WHERE id = ? AND group_id = ? AND uploader_member_id = ? AND message_id IS NULL',
                [attachmentId, groupId, req.user.id],
                (attachmentErr, attachment) => {
                    if (attachmentErr) return res.status(500).json({ error: attachmentErr.message });
                    if (!attachment) return res.status(400).json({ error: 'Pièce jointe introuvable ou déjà utilisée' });
                    callback(attachment);
                }
            );
        };
        const withRecipient = attachment => {
            if (recipientId === 'all') return addMessage(attachment);
            db.get('SELECT id FROM members WHERE id = ? AND group_id = ?', [recipientId, groupId], (recipientErr, member) => {
                if (recipientErr) return res.status(500).json({ error: recipientErr.message });
                if (!member) return res.status(400).json({ error: 'Destinataire invalide pour ce groupe' });
                addMessage(attachment);
            });
        };
        withAttachment(withRecipient);
    });
});

function hydrateChatRows(rows, res) {
    if (!rows.length) return res.json([]);
    const messageIds = rows.map(row => row.id);
    const placeholders = messageIds.map(() => '?').join(',');
    db.all(
        `SELECT r.message_id, r.emoji, r.member_id, m.prenom, m.name
         FROM message_reactions r JOIN members m ON m.id = r.member_id
         WHERE r.message_id IN (${placeholders}) ORDER BY r.created_at ASC`,
        messageIds,
        (reactionErr, reactions) => {
            if (reactionErr) return res.status(500).json({ error: reactionErr.message });
            const byMessage = new Map();
            reactions.forEach(reaction => {
                const list = byMessage.get(reaction.message_id) || [];
                list.push(reaction);
                byMessage.set(reaction.message_id, list);
            });
            res.json(rows.map(row => ({ ...row, reactions: byMessage.get(row.id) || [] })));
        }
    );
}

function requireChatMessageAccess(req, res, groupId, messageId, next) {
    db.get(
        `SELECT * FROM chat_messages WHERE id = ? AND group_id = ? AND COALESCE(conversation_type, 'group') = 'group'`,
        [messageId, groupId],
        (err, message) => {
            if (err) return res.status(500).json({ error: err.message });
            if (!message) return res.status(404).json({ error: 'Message introuvable' });
            const recipientAllowed = isPlatform(req.user) || !message.recipient || message.recipient === 'all'
                || String(message.recipient) === String(req.user.id) || String(message.sender) === String(req.user.id);
            if (!recipientAllowed) return res.status(403).json({ error: 'Accès refusé à ce message' });
            next(message);
        }
    );
}

app.post('/api/chat/:groupId/messages/:messageId/reactions', authenticateToken, (req, res) => {
    const { groupId, messageId } = req.params;
    const emoji = String(req.body.emoji || '');
    if (!['👍', '❤️', '😂', '😮', '🙏'].includes(emoji)) return res.status(400).json({ error: 'Réaction invalide' });
    requireCollaborationMember(req, res, groupId, () => {
        requireChatMessageAccess(req, res, groupId, messageId, () => {
            db.run(
                'INSERT OR IGNORE INTO message_reactions (message_id, member_id, emoji) VALUES (?, ?, ?)',
                [messageId, req.user.id, emoji],
                err => err ? res.status(500).json({ error: err.message }) : res.status(201).json({ message_id: Number(messageId), emoji })
            );
        });
    });
});

app.delete('/api/chat/:groupId/messages/:messageId/reactions/:emoji', authenticateToken, (req, res) => {
    const { groupId, messageId, emoji } = req.params;
    requireCollaborationMember(req, res, groupId, () => {
        requireChatMessageAccess(req, res, groupId, messageId, () => {
            db.run(
                'DELETE FROM message_reactions WHERE message_id = ? AND member_id = ? AND emoji = ?',
                [messageId, req.user.id, emoji],
                function deleteReaction(err) {
                    if (err) return res.status(500).json({ error: err.message });
                    res.json({ removed: this.changes > 0 });
                }
            );
        });
    });
});

app.post('/api/collaboration/attachments', authenticateToken, (req, res) => {
    if (isPlatform(req.user) || !req.user.groupId) return res.status(403).json({ error: 'Réservé aux membres d’un groupe' });
    const mimeType = String(req.get('Content-Type') || '').split(';')[0].toLowerCase();
    const suppliedName = String(req.get('X-File-Name') || '').trim();
    const originalName = path.basename(suppliedName).replace(/[^A-Za-z0-9._ -]/g, '_').slice(0, 180);
    if (!ATTACHMENT_TYPES.has(mimeType) || !originalName || originalName === '.' || originalName === '..') {
        return res.status(400).json({ error: 'Type ou nom de fichier non autorisé' });
    }
    if (!Buffer.isBuffer(req.body) || !req.body.length || req.body.length > MAX_ATTACHMENT_BYTES) {
        return res.status(400).json({ error: 'Le fichier doit peser entre 1 octet et 6 Mo' });
    }
    const extension = path.extname(originalName).toLowerCase().replace(/[^.a-z0-9]/g, '').slice(0, 10);
    const storedName = `${crypto.randomUUID()}${extension}`;
    const target = path.join(UPLOADS_DIRECTORY, storedName);
    if (!target.startsWith(`${UPLOADS_DIRECTORY}${path.sep}`)) return res.status(400).json({ error: 'Chemin de fichier invalide' });
    fs.writeFile(target, req.body, { flag: 'wx', mode: 0o600 }, writeErr => {
        if (writeErr) return res.status(500).json({ error: 'Enregistrement du fichier impossible' });
        db.run(
            `INSERT INTO chat_attachments (group_id, uploader_member_id, original_name, stored_name, mime_type, size_bytes)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [req.user.groupId, req.user.id, originalName, storedName, mimeType, req.body.length],
            function insertAttachment(dbErr) {
                if (dbErr) {
                    fs.unlink(target, () => {});
                    return res.status(500).json({ error: dbErr.message });
                }
                res.status(201).json({
                    id: this.lastID, original_name: originalName, mime_type: mimeType, size_bytes: req.body.length,
                    download_url: `/api/collaboration/attachments/${this.lastID}/download`
                });
            }
        );
    });
});

app.get('/api/collaboration/attachments/:attachmentId/download', authenticateToken, (req, res) => {
    db.get('SELECT * FROM chat_attachments WHERE id = ?', [req.params.attachmentId], (err, attachment) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!attachment) return res.status(404).json({ error: 'Fichier introuvable' });
        requireCollaborationMember(req, res, attachment.group_id, () => {
            if (path.basename(attachment.stored_name) !== attachment.stored_name) return res.status(400).json({ error: 'Fichier invalide' });
            const target = path.join(UPLOADS_DIRECTORY, attachment.stored_name);
            if (!target.startsWith(`${UPLOADS_DIRECTORY}${path.sep}`)) return res.status(400).json({ error: 'Fichier invalide' });
            res.type(attachment.mime_type);
            res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(attachment.original_name)}`);
            res.sendFile(target, sendErr => {
                if (sendErr && !res.headersSent) res.status(sendErr.statusCode || 404).json({ error: 'Fichier indisponible' });
            });
        });
    });
});

function parseMeetingDate(value) {
    if (typeof value !== 'string' || value.length > 40) return null;
    const timestamp = Date.parse(value);
    return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}

app.get('/api/meetings/:groupId', authenticateToken, (req, res) => {
    const { groupId } = req.params;
    requireCollaborationMember(req, res, groupId, () => {
        db.all(
            `SELECT mt.*, creator.prenom AS creator_prenom, creator.name AS creator_name,
                    mine.response AS my_response,
                    (SELECT COUNT(*) FROM meeting_invites invited WHERE invited.meeting_id = mt.id) AS invite_count
             FROM meetings mt
             JOIN members creator ON creator.id = mt.creator_member_id
             LEFT JOIN meeting_invites mine ON mine.meeting_id = mt.id AND mine.member_id = ?
             WHERE mt.group_id = ? ORDER BY mt.starts_at ASC LIMIT 100`,
            [req.user.id, groupId],
            (err, meetings) => err ? res.status(500).json({ error: err.message }) : res.json(meetings)
        );
    });
});

app.post('/api/meetings', authenticateToken, (req, res) => {
    if (isPlatform(req.user)) return res.status(403).json({ error: 'Seul le personnel du groupe peut créer une réunion' });
    const groupId = req.user.groupId;
    const title = String(req.body.title || '').trim();
    const description = String(req.body.description || '').trim();
    const startsAt = parseMeetingDate(req.body.starts_at);
    const endsAt = parseMeetingDate(req.body.ends_at);
    const meetingType = String(req.body.meeting_type || 'conference');
    if (!groupId || !title || title.length > 120 || description.length > 1000 || !startsAt || !endsAt || Date.parse(endsAt) <= Date.parse(startsAt)) {
        return res.status(400).json({ error: 'Informations de réunion invalides' });
    }
    if (!['audio', 'video', 'conference'].includes(meetingType)) {
        return res.status(400).json({ error: 'Type de réunion invalide' });
    }
    requireCollaborationMember(req, res, groupId, () => {
        if (!isGroupStaff(req.user)) return res.status(403).json({ error: 'Droits du personnel du groupe requis' });
        db.all('SELECT id FROM members WHERE group_id = ?', [groupId], (membersErr, groupMembers) => {
            if (membersErr) return res.status(500).json({ error: membersErr.message });
            const requestedRecipients = Array.isArray(req.body.recipient_ids) ? req.body.recipient_ids : groupMembers.map(member => member.id);
            const recipientIds = [...new Set(requestedRecipients.map(String))]
                .filter(id => /^\d+$/.test(id))
                .map(Number);
            if (!recipientIds.length || recipientIds.length !== new Set(requestedRecipients.map(String)).size
                || recipientIds.some(id => !groupMembers.some(member => member.id === id))) {
                return res.status(400).json({ error: 'Les invités doivent tous appartenir au groupe' });
            }
            db.run(
                `INSERT INTO meetings (group_id, creator_member_id, title, description, starts_at, ends_at, meeting_type)
                 VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [groupId, req.user.id, title, description || null, startsAt, endsAt, meetingType],
                function insertMeeting(insertErr) {
                    if (insertErr) return res.status(500).json({ error: insertErr.message });
                    const meetingId = this.lastID;
                    let pending = recipientIds.length;
                    recipientIds.forEach(memberId => db.run(
                        'INSERT INTO meeting_invites (meeting_id, member_id) VALUES (?, ?)',
                        [meetingId, memberId],
                        inviteErr => {
                            if (inviteErr) return res.status(500).json({ error: inviteErr.message });
                            pending -= 1;
                            if (!pending) res.status(201).json({ id: meetingId, recipient_count: recipientIds.length });
                        }
                    ));
                }
            );
        });
    });
});

app.put('/api/meetings/:meetingId/invitation', authenticateToken, (req, res) => {
    const response = String(req.body.response || '');
    if (!['accepted', 'declined', 'pending'].includes(response)) return res.status(400).json({ error: 'Réponse invalide' });
    db.get(
        `SELECT mt.group_id FROM meetings mt
         JOIN meeting_invites mi ON mi.meeting_id = mt.id
         WHERE mt.id = ? AND mi.member_id = ?`,
        [req.params.meetingId, req.user.id],
        (err, invite) => {
            if (err) return res.status(500).json({ error: err.message });
            if (!invite) return res.status(403).json({ error: 'Invitation introuvable ou accès refusé' });
            requireCollaborationMember(req, res, invite.group_id, () => {
                db.run(
                    'UPDATE meeting_invites SET response = ?, responded_at = CURRENT_TIMESTAMP WHERE meeting_id = ? AND member_id = ?',
                    [response, req.params.meetingId, req.user.id],
                    updateErr => updateErr ? res.status(500).json({ error: updateErr.message }) : res.json({ response })
                );
            });
        }
    );
});

app.get('/api/groups/:groupId/account-search', authenticateToken, (req, res) => {
    const query = safeText(req.query.q || '', 80);
    if (!query || query.length < 2) return res.json({ accounts: [] });
    requireActiveGroupStaff(req, res, req.params.groupId, () => {
        const term = `%${query.replace(/[%_\\]/g, '\\$&')}%`;
        db.all(
            `SELECT a.id, a.identifier, a.prenom, a.name, a.phone, a.availability
             FROM platform_accounts a
             WHERE a.status = 'active' AND a.identity_number IS NOT NULL
               AND a.phone_verified_at IS NOT NULL AND a.pin_configured = 1
               AND (a.identifier LIKE ? ESCAPE '\\' OR a.prenom LIKE ? ESCAPE '\\' OR a.name LIKE ? ESCAPE '\\')
               AND NOT EXISTS (
                   SELECT 1 FROM platform_account_memberships pam
                   WHERE pam.account_id = a.id AND pam.group_id = ? AND pam.status = 'active'
               )
             ORDER BY a.prenom, a.name LIMIT 20`,
            [term, term, term, req.params.groupId],
            (err, accounts) => err ? res.status(500).json({ error: err.message }) : res.json({ accounts })
        );
    });
});

app.get('/api/groups/:groupId/invitations', authenticateToken, (req, res) => {
    requireActiveGroupStaff(req, res, req.params.groupId, () => {
        db.all(
            `SELECT i.id, i.status, i.created_at, i.responded_at, a.identifier, a.prenom, a.name,
                    inviter.prenom AS inviter_prenom, inviter.name AS inviter_name
             FROM group_invitations i
             JOIN platform_accounts a ON a.id = i.account_id
             JOIN platform_accounts inviter ON inviter.id = i.invited_by_account_id
             WHERE i.group_id = ? ORDER BY CASE i.status WHEN 'pending' THEN 0 ELSE 1 END, i.created_at DESC`,
            [req.params.groupId],
            (err, invitations) => err ? res.status(500).json({ error: err.message }) : res.json({ invitations })
        );
    });
});

app.post('/api/groups/:groupId/invitations', authenticateToken, (req, res) => {
    const accountId = Number(req.body.account_id);
    if (!Number.isInteger(accountId)) return res.status(400).json({ error: 'Sélectionnez un compte plateforme actif.' });
    if (req.body.role !== undefined && req.body.role !== 'membre') {
        return res.status(403).json({ error: 'L’invitation crée uniquement une adhésion de membre; les rôles sont élus.' });
    }
    requireActiveGroupStaff(req, res, req.params.groupId, actor => {
        db.get(
            `SELECT id FROM platform_accounts
             WHERE id = ? AND status = 'active' AND identity_number IS NOT NULL
               AND phone_verified_at IS NOT NULL AND pin_configured = 1`,
            [accountId],
            (accountErr, account) => {
                if (accountErr) return res.status(500).json({ error: accountErr.message });
                if (!account) return res.status(404).json({ error: 'Compte plateforme actif et finalisé introuvable' });
                db.get(
                    `SELECT account_id FROM platform_account_memberships
                     WHERE member_id = ? AND group_id = ? AND status = 'active'`,
                    [actor.id, req.params.groupId],
                    (membershipErr, inviter) => {
                        if (membershipErr) return res.status(500).json({ error: membershipErr.message });
                        if (!inviter) return res.status(403).json({ error: 'Adhésion active de l’invitant introuvable' });
                        db.run(
                            `INSERT INTO group_invitations (group_id, account_id, invited_by_account_id, role)
                             VALUES (?, ?, ?, 'membre')
                             ON CONFLICT(group_id, account_id) DO UPDATE SET invited_by_account_id = excluded.invited_by_account_id,
                                 role = 'membre', status = 'pending', responded_at = NULL`,
                            [req.params.groupId, accountId, inviter.account_id],
                            function invite(err) {
                                if (err) return res.status(500).json({ error: err.message });
                                notifyAccount(accountId, 'group_invitation', 'Vous avez reçu une invitation à rejoindre un groupe AVEC.', 'group_invitation', this.lastID);
                                res.status(201).json({ id: this.lastID, status: 'pending' });
                            }
                        );
                    }
                );
            }
        );
    });
});

app.get('/api/groups/:groupId/join-requests', authenticateToken, (req, res) => {
    requireActiveGroupStaff(req, res, req.params.groupId, () => {
        db.all(
            `SELECT r.*, a.identifier, a.prenom, a.name, a.availability FROM group_join_requests r
             JOIN platform_accounts a ON a.id = r.account_id
             WHERE r.group_id = ? ORDER BY r.created_at DESC`,
            [req.params.groupId],
            (err, requests) => err ? res.status(500).json({ error: err.message }) : res.json({ requests })
        );
    });
});

app.put('/api/groups/:groupId/join-requests/:requestId', authenticateToken, (req, res) => {
    const status = String(req.body.status || '');
    if (!['approved', 'rejected'].includes(status)) return res.status(400).json({ error: 'Décision invalide' });
    requireActiveGroupStaff(req, res, req.params.groupId, actor => {
        db.get(
            `SELECT r.*, a.identifier AS account_identifier, a.prenom AS account_prenom, a.name AS account_name,
                    a.phone AS account_phone, a.availability AS account_availability
             FROM group_join_requests r JOIN platform_accounts a ON a.id = r.account_id
             WHERE r.id = ? AND r.group_id = ? AND r.status = 'pending'`,
            [req.params.requestId, req.params.groupId],
            (requestErr, joinRequest) => {
                if (requestErr) return res.status(500).json({ error: requestErr.message });
                if (!joinRequest) return res.status(404).json({ error: 'Demande en attente introuvable' });
                db.get('SELECT account_id FROM platform_account_memberships WHERE member_id = ? AND group_id = ? AND status = ?', [actor.id, req.params.groupId, 'active'], (actorErr, actorAccount) => {
                    if (actorErr || !actorAccount) return res.status(actorErr ? 500 : 403).json({ error: actorErr ? actorErr.message : 'Compte de personnel introuvable' });
                    const finish = () => db.run(
                        `UPDATE group_join_requests SET status = ?, reviewed_by_account_id = ?, reviewed_at = CURRENT_TIMESTAMP WHERE id = ?`,
                        [status, actorAccount.account_id, joinRequest.id],
                        updateErr => {
                            if (updateErr) return res.status(500).json({ error: updateErr.message });
                            notifyAccount(joinRequest.account_id, `group_request_${status}`, status === 'approved' ? 'Votre demande pour rejoindre le groupe a été acceptée.' : 'Votre demande pour rejoindre le groupe a été refusée.', 'join_request', joinRequest.id);
                            res.json({ status });
                        }
                    );
                    if (status === 'rejected') return finish();
                    canJoinAnotherGroup(joinRequest.account_id, (eligibilityErr, blockedReason) => {
                        if (eligibilityErr) return res.status(500).json({ error: eligibilityErr.message });
                        if (blockedReason) return res.status(409).json({ error: blockedReason });
                        addAccountToGroup({
                            id: joinRequest.account_id, identifier: joinRequest.account_identifier, prenom: joinRequest.account_prenom,
                            name: joinRequest.account_name, phone: joinRequest.account_phone, availability: joinRequest.account_availability
                        }, req.params.groupId, 'membre', addErr => addErr ? res.status(409).json({ error: addErr.message }) : finish());
                    });
                });
            }
        );
    });
});

function electionListForGroup(groupId, voterMemberId, callback) {
    db.all(
        `SELECT e.*, c.member_id AS candidate_member_id, m.prenom, m.name,
                COUNT(v.id) AS vote_count,
                (SELECT COUNT(1) FROM group_election_votes own_vote
                 WHERE own_vote.election_id = e.id AND own_vote.voter_member_id = ?) AS has_voted
         FROM group_elections e
         JOIN group_election_candidates c ON c.election_id = e.id
         JOIN members m ON m.id = c.member_id
         LEFT JOIN group_election_votes v ON v.election_id = e.id AND v.candidate_member_id = c.member_id
         WHERE e.group_id = ?
         GROUP BY e.id, c.id
         ORDER BY CASE e.status WHEN 'open' THEN 0 ELSE 1 END, e.created_at DESC, c.id`,
        [voterMemberId, groupId],
        (err, rows) => {
            if (err) return callback(err);
            const elections = new Map();
            rows.forEach(row => {
                if (!elections.has(row.id)) {
                    elections.set(row.id, {
                        id: row.id, group_id: row.group_id, role: row.role, title: row.title, status: row.status,
                        proposed_by_member_id: row.proposed_by_member_id, closed_by_member_id: row.closed_by_member_id,
                        elected_member_id: row.elected_member_id, active_member_count_at_close: row.active_member_count_at_close,
                        required_votes: row.required_votes, created_at: row.created_at, closed_at: row.closed_at,
                        has_voted: Boolean(row.has_voted), candidates: []
                    });
                }
                elections.get(row.id).candidates.push({
                    member_id: row.candidate_member_id, prenom: row.prenom, name: row.name, vote_count: Number(row.vote_count)
                });
            });
            db.get(
                `SELECT COUNT(DISTINCT member_id) AS count FROM platform_account_memberships
                 WHERE group_id = ? AND status = 'active'`,
                [groupId],
                (countErr, row) => {
                    if (countErr) return callback(countErr);
                    const activeMemberCount = Number(row.count);
                    callback(null, [...elections.values()].map(election => ({
                        ...election,
                        active_member_count: election.active_member_count_at_close || activeMemberCount,
                        required_votes: election.required_votes || Math.floor(activeMemberCount / 2) + 1
                    })));
                }
            );
        }
    );
}

app.get('/api/groups/:groupId/elections', authenticateToken, (req, res) => {
    requireActiveGroupMember(req, res, req.params.groupId, member => {
        electionListForGroup(req.params.groupId, member.id, (err, elections) => err ? res.status(500).json({ error: err.message }) : res.json({ elections }));
    });
});

app.post('/api/groups/:groupId/elections', authenticateToken, (req, res) => {
    const role = String(req.body.role || '');
    const title = safeText(req.body.title || '', 160);
    const candidateIds = [...new Set((Array.isArray(req.body.candidate_member_ids) ? req.body.candidate_member_ids : []).map(Number))]
        .filter(Number.isInteger);
    if (!GROUP_STAFF_ROLES.includes(role) || !title || !candidateIds.length) {
        return res.status(400).json({ error: 'Rôle, intitulé et au moins une candidature active sont requis.' });
    }
    requireActiveGroupStaff(req, res, req.params.groupId, actor => {
        db.get('SELECT id FROM group_elections WHERE group_id = ? AND role = ? AND status = ?', [req.params.groupId, role, 'open'], (openErr, openElection) => {
            if (openErr) return res.status(500).json({ error: openErr.message });
            if (openElection) return res.status(409).json({ error: 'Une élection est déjà ouverte pour cette fonction.' });
            const placeholders = candidateIds.map(() => '?').join(',');
            db.all(
                `SELECT m.id FROM members m JOIN platform_account_memberships pam ON pam.member_id = m.id
                 WHERE m.group_id = ? AND pam.status = 'active' AND m.id IN (${placeholders})`,
                [req.params.groupId, ...candidateIds],
                (candidateErr, candidates) => {
                    if (candidateErr) return res.status(500).json({ error: candidateErr.message });
                    if (candidates.length !== candidateIds.length) return res.status(400).json({ error: 'Chaque candidature doit être celle d’un membre actif du groupe.' });
                    db.run(
                        `INSERT INTO group_elections (group_id, role, title, proposed_by_member_id)
                         VALUES (?, ?, ?, ?)`,
                        [req.params.groupId, role, title, actor.id],
                        function createElection(createErr) {
                            if (createErr) return res.status(500).json({ error: createErr.message });
                            const electionId = this.lastID;
                            let pending = candidates.length;
                            candidates.forEach(candidate => db.run(
                                'INSERT INTO group_election_candidates (election_id, member_id) VALUES (?, ?)',
                                [electionId, candidate.id],
                                insertErr => {
                                    if (insertErr) return res.status(500).json({ error: insertErr.message });
                                    pending -= 1;
                                    if (!pending) {
                                        recordElectionAudit(electionId, req.params.groupId, actor.id, 'proposed', { role, candidate_member_ids: candidateIds });
                                        recordHistory(req.params.groupId, actor.id, `Élection proposée : ${title}`, () => {});
                                        notifyGroupMembers(req.params.groupId, 'group_election_proposed', `Une élection est ouverte : ${title}.`, 'group_election', electionId);
                                        res.status(201).json({ id: electionId, status: 'open' });
                                    }
                                }
                            ));
                        }
                    );
                }
            );
        });
    });
});

app.post('/api/groups/:groupId/elections/:electionId/votes', authenticateToken, (req, res) => {
    const candidateId = Number(req.body.candidate_member_id);
    if (!Number.isInteger(candidateId)) return res.status(400).json({ error: 'Choisissez une candidature.' });
    requireActiveGroupMember(req, res, req.params.groupId, voter => {
        db.get(
            `SELECT e.id FROM group_elections e JOIN group_election_candidates c ON c.election_id = e.id
             WHERE e.id = ? AND e.group_id = ? AND e.status = 'open' AND c.member_id = ?`,
            [req.params.electionId, req.params.groupId, candidateId],
            (electionErr, election) => {
                if (electionErr) return res.status(500).json({ error: electionErr.message });
                if (!election) return res.status(404).json({ error: 'Élection ouverte ou candidature introuvable.' });
                db.run(
                    `INSERT INTO group_election_votes (election_id, voter_member_id, candidate_member_id)
                     VALUES (?, ?, ?)`,
                    [election.id, voter.id, candidateId],
                    function vote(voteErr) {
                        if (voteErr) return res.status(voteErr.message.includes('UNIQUE') ? 409 : 500).json({ error: voteErr.message.includes('UNIQUE') ? 'Vous avez déjà voté pour cette élection.' : voteErr.message });
                        recordElectionAudit(election.id, req.params.groupId, voter.id, 'voted', { candidate_member_id: candidateId });
                        res.status(201).json({ id: this.lastID, voted: true });
                    }
                );
            }
        );
    });
});

app.post('/api/groups/:groupId/elections/:electionId/close', authenticateToken, (req, res) => {
    requireActiveGroupStaff(req, res, req.params.groupId, closer => {
        db.serialize(() => db.run('BEGIN IMMEDIATE', beginErr => {
            if (beginErr) return res.status(500).json({ error: beginErr.message });
            db.get('SELECT * FROM group_elections WHERE id = ? AND group_id = ? AND status = ?', [req.params.electionId, req.params.groupId, 'open'], (electionErr, election) => {
                if (electionErr || !election) {
                    db.run('ROLLBACK');
                    return res.status(electionErr ? 500 : 404).json({ error: electionErr ? electionErr.message : 'Élection ouverte introuvable.' });
                }
                db.get(`SELECT COUNT(DISTINCT member_id) AS count FROM platform_account_memberships WHERE group_id = ? AND status = 'active'`, [req.params.groupId], (countErr, countRow) => {
                    if (countErr) {
                        db.run('ROLLBACK');
                        return res.status(500).json({ error: countErr.message });
                    }
                    const activeMemberCount = Number(countRow.count);
                    const requiredVotes = Math.floor(activeMemberCount / 2) + 1;
                    db.all(
                        `SELECT candidate_member_id, COUNT(*) AS votes FROM group_election_votes
                         WHERE election_id = ? GROUP BY candidate_member_id ORDER BY votes DESC`,
                        [election.id],
                        (votesErr, results) => {
                            if (votesErr) {
                                db.run('ROLLBACK');
                                return res.status(500).json({ error: votesErr.message });
                            }
                            const winner = results.find(result => Number(result.votes) >= requiredVotes);
                            const status = winner ? 'closed_elected' : 'closed_unfilled';
                            const finishElection = () => db.run(
                                `UPDATE group_elections SET status = ?, closed_by_member_id = ?, elected_member_id = ?,
                                    active_member_count_at_close = ?, required_votes = ?, closed_at = CURRENT_TIMESTAMP
                                 WHERE id = ? AND status = 'open'`,
                                [status, closer.id, winner ? winner.candidate_member_id : null, activeMemberCount, requiredVotes, election.id],
                                function closeErr(closeErr) {
                                    if (closeErr || !this.changes) {
                                        db.run('ROLLBACK');
                                        return res.status(closeErr ? 500 : 409).json({ error: closeErr ? closeErr.message : 'Élection déjà clôturée.' });
                                    }
                                    db.run('COMMIT', commitErr => {
                                        if (commitErr) return res.status(500).json({ error: commitErr.message });
                                        const message = winner
                                            ? `Résultat d’élection : un membre a été élu·e ${election.role} avec ${winner.votes}/${requiredVotes} voix requises.`
                                            : `Résultat d’élection : aucun candidat n’a atteint la majorité absolue (${requiredVotes} voix requises sur ${activeMemberCount} membres actifs).`;
                                        recordElectionAudit(election.id, req.params.groupId, closer.id, 'closed', { status, active_member_count: activeMemberCount, required_votes: requiredVotes, elected_member_id: winner?.candidate_member_id || null });
                                        recordHistory(req.params.groupId, closer.id, message, () => {});
                                        notifyGroupMembers(req.params.groupId, 'group_election_closed', message, 'group_election', election.id);
                                        res.json({ status, active_member_count: activeMemberCount, required_votes: requiredVotes, elected_member_id: winner?.candidate_member_id || null });
                                    });
                                }
                            );
                            if (!winner) return finishElection();
                            db.run(`UPDATE members SET role = 'membre', role_origin = 'member'
                                    WHERE group_id = ? AND role = ? AND id <> ?`,
                                [req.params.groupId, election.role, winner.candidate_member_id],
                                demoteErr => {
                                    if (demoteErr) {
                                        db.run('ROLLBACK');
                                        return res.status(500).json({ error: demoteErr.message });
                                    }
                                    db.run(`UPDATE members SET role = ?, role_origin = 'election' WHERE id = ? AND group_id = ?`,
                                        [election.role, winner.candidate_member_id, req.params.groupId],
                                        promoteErr => {
                                            if (promoteErr) {
                                                db.run('ROLLBACK');
                                                return res.status(500).json({ error: promoteErr.message });
                                            }
                                            finishElection();
                                        });
                                });
                        }
                    );
                });
            });
        }));
    });
});

app.get('/api/platform/groups', authenticateAccount, (req, res) => {
    db.all(
        `SELECT g.id, g.name, g.country, g.city, g.currency, COUNT(pam.id) AS member_count
         FROM groups g LEFT JOIN platform_account_memberships pam ON pam.group_id = g.id AND pam.status = 'active'
         GROUP BY g.id ORDER BY g.created_at DESC`,
        [], (err, groups) => err ? res.status(500).json({ error: err.message }) : res.json({ groups })
    );
});

app.get('/api/platform/my-groups', authenticateAccount, (req, res) => {
    db.all(
        `SELECT g.id, g.name, g.country, g.city, g.currency, m.role FROM platform_account_memberships pam
         JOIN groups g ON g.id = pam.group_id JOIN members m ON m.id = pam.member_id
         WHERE pam.account_id = ? AND pam.status = 'active' ORDER BY g.name`,
        [req.account.id], (err, groups) => err ? res.status(500).json({ error: err.message }) : res.json({ groups })
    );
});

// The portal is the canonical member entry point. It issues the existing
// group-scoped session only for a group the authenticated account belongs to,
// so the established accounting, president, and member controls retain their
// server-side role checks without exposing another member's dashboard.
app.post('/api/platform/groups/:groupId/dashboard', authenticateAccount, (req, res) => {
    accountMembership(req.account.id, req.params.groupId, (membershipErr, membership) => {
        if (membershipErr) return res.status(500).json({ error: membershipErr.message });
        if (!membership) return res.status(403).json({ error: 'Vous n’êtes pas membre actif de ce groupe' });
        db.get('SELECT * FROM members WHERE id = ? AND group_id = ?', [membership.member_id, req.params.groupId], (memberErr, member) => {
            if (memberErr) return res.status(500).json({ error: memberErr.message });
            if (!member) return res.status(404).json({ error: 'Membre du groupe introuvable' });
            createTokens(member, (tokenErr, tokens) => {
                if (tokenErr) return res.status(500).json({ error: tokenErr.message });
                res.json({
                    ...tokens,
                    memberId: member.id,
                    groupId: member.group_id,
                    member: memberResponse(member),
                    dashboard: { path: 'index.html', groupId: member.group_id, memberId: member.id }
                });
            });
        });
    });
});

app.post('/api/platform/groups/:groupId/join-requests', authenticateAccount, (req, res) => {
    const note = safeText(req.body.note || '', 500) || null;
    canJoinAnotherGroup(req.account.id, (eligibilityErr, blockedReason) => {
        if (eligibilityErr) return res.status(500).json({ error: eligibilityErr.message });
        if (blockedReason) return res.status(403).json({ error: blockedReason });
        db.get('SELECT id FROM groups WHERE id = ?', [req.params.groupId], (groupErr, group) => {
        if (groupErr) return res.status(500).json({ error: groupErr.message });
        if (!group) return res.status(404).json({ error: 'Groupe introuvable' });
        accountMembership(req.account.id, group.id, (membershipErr, membership) => {
            if (membershipErr) return res.status(500).json({ error: membershipErr.message });
            if (membership) return res.status(409).json({ error: 'Vous êtes déjà membre de ce groupe' });
            db.run(
                `INSERT INTO group_join_requests (group_id, account_id, note) VALUES (?, ?, ?)
                 ON CONFLICT(group_id, account_id) DO UPDATE SET note = excluded.note, status = 'pending', reviewed_by_account_id = NULL, reviewed_at = NULL`,
                [group.id, req.account.id, note],
                function requestJoin(err) {
                    if (err) return res.status(500).json({ error: err.message });
                    db.all(
                        `SELECT pam.account_id FROM platform_account_memberships pam JOIN members m ON m.id = pam.member_id
                         WHERE pam.group_id = ? AND pam.status = 'active' AND m.role IN ('president', 'vice_president', 'comptable', 'secretaire')`,
                        [group.id], (staffErr, staff) => {
                            if (!staffErr) staff.forEach(person => notifyAccount(person.account_id, 'group_join_request', `${req.account.prenom} souhaite rejoindre votre groupe.`, 'join_request', this.lastID));
                            res.status(201).json({ id: this.lastID, status: 'pending' });
                        }
                    );
                }
            );
        });
    });
    });
});

app.get('/api/platform/groups/:groupId/join-requests', authenticateAccount, (req, res) => {
    requireAccountGroupStaff(req, res, req.params.groupId, () => {
        db.all(
            `SELECT r.*, a.identifier, a.prenom, a.name, a.availability FROM group_join_requests r
             JOIN platform_accounts a ON a.id = r.account_id WHERE r.group_id = ? ORDER BY r.created_at DESC`,
            [req.params.groupId], (err, requests) => err ? res.status(500).json({ error: err.message }) : res.json({ requests })
        );
    });
});

app.put('/api/platform/join-requests/:requestId', authenticateAccount, (req, res) => {
    const status = String(req.body.status || '');
    if (!['approved', 'rejected'].includes(status)) return res.status(400).json({ error: 'Décision invalide' });
    db.get(
        `SELECT r.*, a.identifier AS account_identifier, a.prenom AS account_prenom, a.name AS account_name,
                a.phone AS account_phone, a.availability AS account_availability
         FROM group_join_requests r JOIN platform_accounts a ON a.id = r.account_id WHERE r.id = ?`,
        [req.params.requestId], (err, request) => {
            if (err) return res.status(500).json({ error: err.message });
            if (!request || request.status !== 'pending') return res.status(404).json({ error: 'Demande en attente introuvable' });
            requireAccountGroupStaff(req, res, request.group_id, () => {
                const complete = () => db.run(
                    'UPDATE group_join_requests SET status = ?, reviewed_by_account_id = ?, reviewed_at = CURRENT_TIMESTAMP WHERE id = ?',
                    [status, req.account.id, request.id],
                    updateErr => {
                        if (updateErr) return res.status(500).json({ error: updateErr.message });
                        notifyAccount(request.account_id, `group_request_${status}`, status === 'approved' ? 'Votre demande pour rejoindre le groupe a été acceptée.' : 'Votre demande pour rejoindre le groupe a été refusée.', 'join_request', request.id);
                        res.json({ status });
                    }
                );
                if (status === 'rejected') return complete();
                canJoinAnotherGroup(request.account_id, (eligibilityErr, blockedReason) => {
                    if (eligibilityErr) return res.status(500).json({ error: eligibilityErr.message });
                    if (blockedReason) return res.status(409).json({ error: blockedReason });
                    addAccountToGroup({
                        id: request.account_id, identifier: request.account_identifier, prenom: request.account_prenom,
                        name: request.account_name, phone: request.account_phone, availability: request.account_availability
                    }, request.group_id, 'membre', addErr => addErr ? res.status(409).json({ error: addErr.message }) : complete());
                });
            });
        }
    );
});

app.post('/api/platform/groups/:groupId/invitations', authenticateAccount, (req, res) => {
    const requestedAccountId = Number(req.body.account_id);
    const identifier = safeText(req.body.identifier || '', 40);
    if (!Number.isInteger(requestedAccountId) && !identifier) return res.status(400).json({ error: 'Invitation invalide' });
    if (req.body.role !== undefined && req.body.role !== 'membre') {
        return res.status(403).json({ error: 'Une invitation ne crée qu’une adhésion de membre; les fonctions du personnel sont élues.' });
    }
    requireAccountGroupStaff(req, res, req.params.groupId, () => {
        db.get(`SELECT * FROM platform_accounts WHERE ${Number.isInteger(requestedAccountId) ? 'id = ?' : 'identifier = ?'} AND status = ?`, [Number.isInteger(requestedAccountId) ? requestedAccountId : identifier, 'active'], (accountErr, invitee) => {
            if (accountErr) return res.status(500).json({ error: accountErr.message });
            if (!invitee) return res.status(404).json({ error: 'Compte plateforme introuvable' });
            const accountId = invitee.id;
            accountMembership(accountId, req.params.groupId, (membershipErr, membership) => {
                if (membershipErr) return res.status(500).json({ error: membershipErr.message });
                if (membership) return res.status(409).json({ error: 'Cette personne est déjà membre' });
                db.run(
                    `INSERT INTO group_invitations (group_id, account_id, invited_by_account_id, role) VALUES (?, ?, ?, 'membre')
                     ON CONFLICT(group_id, account_id) DO UPDATE SET invited_by_account_id = excluded.invited_by_account_id, role = 'membre', status = 'pending', responded_at = NULL`,
                    [req.params.groupId, accountId, req.account.id],
                    function invite(err) {
                        if (err) return res.status(500).json({ error: err.message });
                        notifyAccount(accountId, 'group_invitation', `Vous avez reçu une invitation à rejoindre un groupe AVEC.`, 'group_invitation', this.lastID);
                        res.status(201).json({ id: this.lastID, status: 'pending' });
                    }
                );
            });
        });
    });
});

app.get('/api/platform/groups/:groupId/invite-candidates', authenticateAccount, (req, res) => {
    requireAccountGroupStaff(req, res, req.params.groupId, () => {
        db.all(
            `SELECT a.id, a.identifier, a.prenom, a.name, a.availability, a.avatar_media_id, a.created_at
             FROM platform_accounts a
             WHERE a.status = 'active' AND a.id <> ?
               AND (
                    a.visibility = 'public' OR EXISTS (
                        SELECT 1 FROM friendships f WHERE f.status = 'accepted'
                        AND ((f.account_one_id = ? AND f.account_two_id = a.id) OR (f.account_two_id = ? AND f.account_one_id = a.id))
                    )
               )
               AND NOT EXISTS (
                    SELECT 1 FROM platform_account_memberships membership
                    JOIN members member ON member.id = membership.member_id
                    WHERE membership.account_id = a.id AND membership.status = 'active'
                      AND member.role IN ('president', 'vice_president', 'comptable', 'secretaire')
               )
               AND NOT EXISTS (
                    SELECT 1 FROM platform_account_memberships membership
                    WHERE membership.account_id = a.id AND membership.group_id = ? AND membership.status = 'active'
               )
               AND NOT EXISTS (
                    SELECT 1 FROM group_invitations invitation
                    WHERE invitation.account_id = a.id AND invitation.group_id = ? AND invitation.status = 'pending'
               )
             ORDER BY CASE WHEN a.created_at >= datetime('now', '-30 days') THEN 0 ELSE 1 END, a.created_at DESC
             LIMIT 30`,
            [req.account.id, req.account.id, req.account.id, req.params.groupId, req.params.groupId],
            (err, members) => err ? res.status(500).json({ error: err.message }) : res.json({ members })
        );
    });
});

app.get('/api/platform/invitations', authenticateAccount, (req, res) => {
    db.all(
        `SELECT i.*, g.name AS group_name, g.country, a.prenom AS inviter_prenom, a.name AS inviter_name
         FROM group_invitations i JOIN groups g ON g.id = i.group_id JOIN platform_accounts a ON a.id = i.invited_by_account_id
         WHERE i.account_id = ? ORDER BY i.created_at DESC`,
        [req.account.id], (err, invitations) => err ? res.status(500).json({ error: err.message }) : res.json({ invitations })
    );
});

app.put('/api/platform/invitations/:invitationId', authenticateAccount, (req, res) => {
    const status = String(req.body.status || '');
    if (!['accepted', 'declined'].includes(status)) return res.status(400).json({ error: 'Réponse invalide' });
    db.get('SELECT * FROM group_invitations WHERE id = ? AND account_id = ? AND status = ?', [req.params.invitationId, req.account.id, 'pending'], (err, invitation) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!invitation) return res.status(404).json({ error: 'Invitation en attente introuvable' });
        const finish = () => db.run('UPDATE group_invitations SET status = ?, responded_at = CURRENT_TIMESTAMP WHERE id = ?', [status, invitation.id], updateErr => {
            if (updateErr) return res.status(500).json({ error: updateErr.message });
            notifyAccount(invitation.invited_by_account_id, 'group_invitation_response', status === 'accepted' ? 'Votre invitation a été acceptée.' : 'Votre invitation a été déclinée.', 'group_invitation', invitation.id);
            res.json({ status });
        });
        if (status === 'declined') return finish();
        canJoinAnotherGroup(req.account.id, (eligibilityErr, blockedReason) => {
            if (eligibilityErr) return res.status(500).json({ error: eligibilityErr.message });
            if (blockedReason) return res.status(403).json({ error: blockedReason });
            addAccountToGroup(req.account, invitation.group_id, 'membre', addErr => addErr ? res.status(409).json({ error: addErr.message }) : finish());
        });
    });
});

app.get('/api/platform/notifications', authenticateAccount, (req, res) => {
    db.all('SELECT * FROM account_notifications WHERE account_id = ? ORDER BY created_at DESC LIMIT 50', [req.account.id], (err, notifications) => err ? res.status(500).json({ error: err.message }) : res.json({ notifications }));
});
app.put('/api/platform/notifications/:notificationId/read', authenticateAccount, (req, res) => {
    db.run('UPDATE account_notifications SET read_at = CURRENT_TIMESTAMP WHERE id = ? AND account_id = ?', [req.params.notificationId, req.account.id], err => err ? res.status(500).json({ error: err.message }) : res.json({ ok: true }));
});

app.get('/api/platform/members/search', authenticateAccount, (req, res) => {
    const query = safeText(req.query.q || '', 80);
    if (!query || query.length < 2) return res.json({ members: [] });
    const term = `%${query.replace(/[%_\\]/g, '\\$&')}%`;
    db.all(
        `SELECT id, identifier, prenom, name, availability, visibility, avatar_media_id FROM platform_accounts
         WHERE status = 'active' AND visibility = 'public' AND id <> ?
           AND (identifier LIKE ? ESCAPE '\\' OR prenom LIKE ? ESCAPE '\\' OR name LIKE ? ESCAPE '\\')
         ORDER BY prenom, name LIMIT 20`,
        [req.account.id, term, term, term],
        (err, members) => err ? res.status(500).json({ error: err.message }) : res.json({ members })
    );
});

app.get('/api/platform/members/:accountId', authenticateAccount, (req, res) => {
    db.get('SELECT * FROM platform_accounts WHERE id = ? AND status = ?', [req.params.accountId, 'active'], (err, account) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!account) return res.status(404).json({ error: 'Membre introuvable' });
        canSeeAccount(req.account.id, account, (privacyErr, allowed) => privacyErr ? res.status(500).json({ error: privacyErr.message }) : allowed ? res.json({ member: accountPublicResponse(account) }) : res.status(403).json({ error: 'Profil privé' }));
    });
});

app.get('/api/platform/friends', authenticateAccount, (req, res) => {
    db.all(
        `SELECT f.*, a.id AS member_id, a.identifier, a.prenom, a.name, a.availability, a.avatar_media_id
         FROM friendships f JOIN platform_accounts a ON a.id = CASE WHEN f.account_one_id = ? THEN f.account_two_id ELSE f.account_one_id END
         WHERE (f.account_one_id = ? OR f.account_two_id = ?) ORDER BY f.created_at DESC`,
        [req.account.id, req.account.id, req.account.id],
        (err, friends) => err ? res.status(500).json({ error: err.message }) : res.json({ friends })
    );
});

app.post('/api/platform/friends/requests', authenticateAccount, (req, res) => {
    const recipientId = Number(req.body.account_id);
    if (!Number.isInteger(recipientId) || recipientId === req.account.id) return res.status(400).json({ error: 'Destinataire invalide' });
    db.get('SELECT id FROM platform_accounts WHERE id = ? AND status = ?', [recipientId, 'active'], (lookupErr, recipient) => {
        if (lookupErr) return res.status(500).json({ error: lookupErr.message });
        if (!recipient) return res.status(404).json({ error: 'Membre introuvable' });
        const [one, two] = [req.account.id, recipientId].sort((a, b) => a - b);
        db.run(
            `INSERT INTO friendships (account_one_id, account_two_id, requested_by_account_id) VALUES (?, ?, ?)
             ON CONFLICT(account_one_id, account_two_id) DO UPDATE SET requested_by_account_id = excluded.requested_by_account_id, status = 'pending', responded_at = NULL`,
            [one, two, req.account.id],
            function requestFriend(err) {
                if (err) return res.status(500).json({ error: err.message });
                notifyAccount(recipientId, 'friend_request', `${req.account.prenom} vous a envoyé une demande de connexion.`, 'friendship', this.lastID);
                res.status(201).json({ id: this.lastID, status: 'pending' });
            }
        );
    });
});

app.put('/api/platform/friends/:friendshipId', authenticateAccount, (req, res) => {
    const status = String(req.body.status || '');
    if (!['accepted', 'rejected'].includes(status)) return res.status(400).json({ error: 'Réponse invalide' });
    db.get('SELECT * FROM friendships WHERE id = ? AND status = ?', [req.params.friendshipId, 'pending'], (err, friendship) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!friendship || friendship.requested_by_account_id === req.account.id || (friendship.account_one_id !== req.account.id && friendship.account_two_id !== req.account.id)) return res.status(403).json({ error: 'Demande introuvable ou non autorisée' });
        db.run('UPDATE friendships SET status = ?, responded_at = CURRENT_TIMESTAMP WHERE id = ?', [status, friendship.id], updateErr => {
            if (updateErr) return res.status(500).json({ error: updateErr.message });
            notifyAccount(friendship.requested_by_account_id, `friend_${status}`, status === 'accepted' ? 'Votre demande de connexion a été acceptée.' : 'Votre demande de connexion a été refusée.', 'friendship', friendship.id);
            res.json({ status });
        });
    });
});

app.get('/api/platform/dms/:accountId', authenticateAccount, (req, res) => {
    const otherId = Number(req.params.accountId);
    connectedAccounts(req.account.id, otherId, (connectionErr, friendship) => {
        if (connectionErr) return res.status(500).json({ error: connectionErr.message });
        if (!friendship) return res.status(403).json({ error: 'La messagerie directe est réservée aux contacts connectés' });
        db.all(
            `SELECT dm.*, a.identifier, a.prenom, a.name, a.avatar_media_id,
                    att.id AS attachment_id, att.original_name AS attachment_name, att.mime_type AS attachment_mime_type
             FROM direct_messages dm JOIN platform_accounts a ON a.id = dm.sender_account_id
             LEFT JOIN direct_message_attachments att ON att.message_id = dm.id
             WHERE (dm.sender_account_id = ? AND dm.recipient_account_id = ?) OR (dm.sender_account_id = ? AND dm.recipient_account_id = ?)
             ORDER BY dm.created_at ASC LIMIT 200`,
            [req.account.id, otherId, otherId, req.account.id],
            (err, messages) => {
                if (err) return res.status(500).json({ error: err.message });
                hydrateDirectMessages(messages, res);
            }
        );
    });
});

app.post('/api/platform/dms/:accountId', authenticateAccount, (req, res) => {
    const recipientId = Number(req.params.accountId);
    const message = safeText(req.body.message || '', 1000) || '';
    const attachmentId = req.body.attachment_id == null ? null : Number(req.body.attachment_id);
    if (!message && !Number.isInteger(attachmentId)) return res.status(400).json({ error: 'Message ou pièce jointe requis' });
    connectedAccounts(req.account.id, recipientId, (connectionErr, friendship) => {
        if (connectionErr) return res.status(500).json({ error: connectionErr.message });
        if (!friendship) return res.status(403).json({ error: 'La messagerie directe est réservée aux contacts connectés' });
        const send = attachment => db.run(
            'INSERT INTO direct_messages (sender_account_id, recipient_account_id, message) VALUES (?, ?, ?)',
            [req.account.id, recipientId, message],
            function sendErr(err) {
                if (err) return res.status(500).json({ error: err.message });
                const messageId = this.lastID;
                const finish = () => {
                    notifyAccount(recipientId, 'direct_message', `${req.account.prenom} vous a envoyé un message privé.`, 'direct_message', messageId);
                    res.status(201).json({ id: messageId, attachment_id: attachment ? attachment.id : null });
                };
                if (!attachment) return finish();
                db.run('UPDATE direct_message_attachments SET message_id = ? WHERE id = ? AND message_id IS NULL', [messageId, attachment.id], updateErr => updateErr ? res.status(500).json({ error: updateErr.message }) : finish());
            }
        );
        if (!attachmentId) return send(null);
        db.get(
            `SELECT id FROM direct_message_attachments
             WHERE id = ? AND sender_account_id = ? AND recipient_account_id = ? AND message_id IS NULL`,
            [attachmentId, req.account.id, recipientId],
            (attachmentErr, attachment) => {
                if (attachmentErr) return res.status(500).json({ error: attachmentErr.message });
                if (!attachment) return res.status(400).json({ error: 'Pièce jointe introuvable ou déjà utilisée' });
                send(attachment);
            }
        );
    });
});

function hydrateDirectMessages(messages, res) {
    if (!messages.length) return res.json({ messages });
    const ids = messages.map(message => message.id);
    db.all(
        `SELECT message_id, account_id, emoji FROM direct_message_reactions
         WHERE message_id IN (${ids.map(() => '?').join(',')}) ORDER BY created_at ASC`,
        ids,
        (err, reactions) => {
            if (err) return res.status(500).json({ error: err.message });
            const byMessage = new Map();
            reactions.forEach(reaction => {
                const list = byMessage.get(reaction.message_id) || [];
                list.push(reaction);
                byMessage.set(reaction.message_id, list);
            });
            res.json({ messages: messages.map(message => ({ ...message, reactions: byMessage.get(message.id) || [] })) });
        }
    );
}

function requireDirectMessageAccess(req, res, otherId, messageId, next) {
    if (!Number.isInteger(otherId) || otherId === req.account.id) return res.status(400).json({ error: 'Destinataire invalide' });
    connectedAccounts(req.account.id, otherId, (connectionErr, friendship) => {
        if (connectionErr) return res.status(500).json({ error: connectionErr.message });
        if (!friendship) return res.status(403).json({ error: 'La messagerie directe est réservée aux contacts connectés' });
        db.get(
            `SELECT * FROM direct_messages WHERE id = ? AND
             ((sender_account_id = ? AND recipient_account_id = ?) OR (sender_account_id = ? AND recipient_account_id = ?))`,
            [messageId, req.account.id, otherId, otherId, req.account.id],
            (err, message) => {
                if (err) return res.status(500).json({ error: err.message });
                if (!message) return res.status(404).json({ error: 'Message introuvable' });
                next(message);
            }
        );
    });
}

app.post('/api/platform/dm-attachments/:accountId', authenticateAccount, (req, res) => {
    const recipientId = Number(req.params.accountId);
    if (!ATTACHMENT_TYPES.has(String(req.get('Content-Type') || '').toLowerCase().split(';')[0]) || !Buffer.isBuffer(req.body) || !req.body.length) {
        return res.status(400).json({ error: 'Document, image ou vidéo autorisé requis' });
    }
    connectedAccounts(req.account.id, recipientId, (connectionErr, friendship) => {
        if (connectionErr) return res.status(500).json({ error: connectionErr.message });
        if (!friendship) return res.status(403).json({ error: 'La messagerie directe est réservée aux contacts connectés' });
        const mimeType = String(req.get('Content-Type')).toLowerCase().split(';')[0];
        const originalName = path.basename(String(req.get('X-File-Name') || 'piece-jointe')).replace(/[^\w.\-]/g, '_').slice(0, 120) || 'piece-jointe';
        const storedName = `${crypto.randomUUID()}${path.extname(originalName).slice(0, 12)}`;
        fs.writeFile(path.join(UPLOADS_DIRECTORY, storedName), req.body, { mode: 0o600 }, writeErr => {
            if (writeErr) return res.status(500).json({ error: 'Téléversement impossible' });
            db.run(
                `INSERT INTO direct_message_attachments
                 (sender_account_id, recipient_account_id, original_name, stored_name, mime_type, size_bytes)
                 VALUES (?, ?, ?, ?, ?, ?)`,
                [req.account.id, recipientId, originalName, storedName, mimeType, req.body.length],
                function insertErr(err) {
                    if (err) {
                        fs.unlink(path.join(UPLOADS_DIRECTORY, storedName), () => {});
                        return res.status(500).json({ error: err.message });
                    }
                    res.status(201).json({ attachment: { id: this.lastID, original_name: originalName, mime_type: mimeType, size_bytes: req.body.length } });
                }
            );
        });
    });
});

app.get('/api/platform/dm-attachments/:attachmentId/download', authenticateAccount, (req, res) => {
    db.get('SELECT * FROM direct_message_attachments WHERE id = ?', [req.params.attachmentId], (err, attachment) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!attachment || (attachment.sender_account_id !== req.account.id && attachment.recipient_account_id !== req.account.id)) return res.status(404).json({ error: 'Pièce jointe introuvable' });
        if (path.basename(attachment.stored_name) !== attachment.stored_name) return res.status(400).json({ error: 'Fichier invalide' });
        const target = path.join(UPLOADS_DIRECTORY, attachment.stored_name);
        if (!target.startsWith(`${UPLOADS_DIRECTORY}${path.sep}`)) return res.status(400).json({ error: 'Fichier invalide' });
        res.type(attachment.mime_type);
        res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(attachment.original_name)}`);
        res.sendFile(target, sendErr => { if (sendErr && !res.headersSent) res.status(sendErr.statusCode || 404).json({ error: 'Fichier indisponible' }); });
    });
});

app.post('/api/platform/dms/:accountId/messages/:messageId/reactions', authenticateAccount, (req, res) => {
    const emoji = String(req.body.emoji || '');
    if (!['👍', '❤️', '😂', '😮', '🙏', '🎉'].includes(emoji)) return res.status(400).json({ error: 'Réaction non autorisée' });
    requireDirectMessageAccess(req, res, Number(req.params.accountId), req.params.messageId, () => {
        db.run('INSERT OR IGNORE INTO direct_message_reactions (message_id, account_id, emoji) VALUES (?, ?, ?)', [req.params.messageId, req.account.id, emoji], err => err ? res.status(500).json({ error: err.message }) : res.status(201).json({ ok: true }));
    });
});

app.delete('/api/platform/dms/:accountId/messages/:messageId/reactions/:emoji', authenticateAccount, (req, res) => {
    requireDirectMessageAccess(req, res, Number(req.params.accountId), req.params.messageId, () => {
        db.run('DELETE FROM direct_message_reactions WHERE message_id = ? AND account_id = ? AND emoji = ?', [req.params.messageId, req.account.id, req.params.emoji], function removeErr(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ removed: this.changes > 0 });
        });
    });
});

app.post('/api/social/uploads', authenticateAccount, (req, res) => saveSocialMedia(req, req.account.id, 'post', (err, media) => err ? res.status(400).json({ error: err.message }) : res.status(201).json({ media })));

function canSeePost(accountId, post, callback) {
    if (Number(accountId) === Number(post.author_account_id) || post.visibility === 'public') return callback(null, true);
    connectedAccounts(accountId, post.author_account_id, (err, friendship) => callback(err, Boolean(friendship)));
}

app.get('/api/social/feed', authenticateAccount, (req, res) => {
    db.all(
        `SELECT p.*, a.identifier, a.prenom, a.name, a.avatar_media_id, mf.mime_type AS media_mime_type, mf.size_bytes AS media_size_bytes,
                (SELECT COUNT(*) FROM post_reactions r WHERE r.post_id = p.id) AS reaction_count,
               (SELECT COUNT(*) FROM post_comments c WHERE c.post_id = p.id AND c.moderation_status <> 'removed' AND (c.moderation_status = 'approved' OR c.author_account_id = ?)) AS comment_count
         FROM social_posts p JOIN platform_accounts a ON a.id = p.author_account_id
         LEFT JOIN media_files mf ON mf.id = p.media_id
         WHERE p.deleted_at IS NULL AND p.moderation_status <> 'removed' AND (p.moderation_status = 'approved' OR p.author_account_id = ?) AND (p.visibility = 'public' OR p.author_account_id = ? OR EXISTS (
            SELECT 1 FROM friendships f WHERE f.status = 'accepted' AND
             ((f.account_one_id = p.author_account_id AND f.account_two_id = ?) OR (f.account_two_id = p.author_account_id AND f.account_one_id = ?))
         )) ORDER BY p.created_at DESC LIMIT 100`,
        [req.account.id, req.account.id, req.account.id, req.account.id],
        (err, posts) => {
           if (err) return res.status(500).json({ error: err.message });
           if (!posts.length) return res.json({ posts });
           const ids = posts.map(post => post.id);
           db.all(
               `SELECT c.*, a.identifier, a.prenom, a.name FROM post_comments c
                JOIN platform_accounts a ON a.id = c.author_account_id
                WHERE c.post_id IN (${ids.map(() => '?').join(',')})
                  AND c.moderation_status <> 'removed' AND (c.moderation_status = 'approved' OR c.author_account_id = ?)
                ORDER BY c.created_at ASC`,
               [...ids, req.account.id],
               (commentsErr, comments) => {
                   if (commentsErr) return res.status(500).json({ error: commentsErr.message });
                   hydratePostComments(comments, commentsErr => {
                       if (commentsErr) return res.status(500).json({ error: commentsErr.message });
                       const commentsByPost = new Map(ids.map(id => [id, []]));
                       comments.forEach(comment => commentsByPost.get(comment.post_id).push(comment));
                       posts.forEach(post => { post.comments = commentsByPost.get(post.id); });
                       res.json({ posts });
                   });
               }
           );
        }
    );
});

function hydratePostComments(comments, callback) {
    if (!comments.length) return callback(null);
    const ids = comments.map(comment => comment.id);
    db.all(
        `SELECT comment_id, account_id, reaction FROM comment_reactions
         WHERE comment_id IN (${ids.map(() => '?').join(',')}) ORDER BY created_at ASC`,
        ids,
        (err, reactions) => {
            if (err) return callback(err);
            const byComment = new Map();
            reactions.forEach(reaction => {
                const list = byComment.get(reaction.comment_id) || [];
                list.push(reaction);
                byComment.set(reaction.comment_id, list);
            });
            comments.forEach(comment => { comment.reactions = byComment.get(comment.id) || []; });
            callback(null);
        }
    );
}

app.post('/api/social/posts', authenticateAccount, (req, res) => {
    const body = safeText(req.body.body || '', 1500) || '';
    const visibility = String(req.body.visibility || 'friends');
    const mediaId = req.body.media_id == null ? null : Number(req.body.media_id);
    if (!body && !mediaId) return res.status(400).json({ error: 'Écrivez un message ou ajoutez une image' });
    if (!['public', 'friends'].includes(visibility) || (mediaId !== null && !Number.isInteger(mediaId))) return res.status(400).json({ error: 'Publication invalide' });
    const insert = media => {
        const classification = moderationClassification(body, media && media.original_name);
        beginSocialMutation(req, res, 'social_post', (idempotencyKey, complete) => {
            db.run(
                `INSERT INTO social_posts (author_account_id, body, visibility, media_id, moderation_status, moderation_reason, review_tag)
                 VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [req.account.id, body, visibility, mediaId, classification.status, classification.reason, classification.reviewTag],
                function postErr(err) {
                    if (err) return complete(500, { error: err.message });
                    const postId = this.lastID;
                    writeSocialSandboxCharge({
                        idempotencyKey, contentType: 'post', contentId: postId, chargedAccountId: req.account.id,
                        postAuthorAccountId: req.account.id, amountMinor: socialPrice('post', media)
                    }, (chargeErr, receipt) => {
                        if (chargeErr) return complete(500, { error: chargeErr.message });
                        const respond = () => complete(201, {
                            id: postId, moderation_status: classification.status, review_tag: classification.reviewTag,
                            receipt
                        });
                        if (classification.status !== 'pending') return respond();
                        db.run(
                            `INSERT INTO social_moderation_audit (audit_id, content_type, content_id, action, reason)
                             VALUES (?, 'post', ?, 'queued', ?)`,
                            [newSecureId(), postId, classification.reason],
                            auditErr => auditErr ? complete(500, { error: auditErr.message }) : respond()
                        );
                    });
                }
            );
        });
    };
    if (mediaId === null) return insert(null);
    db.get('SELECT id, original_name, mime_type, size_bytes FROM media_files WHERE id = ? AND owner_account_id = ? AND purpose = ?', [mediaId, req.account.id, 'post'], (err, media) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!media) return res.status(403).json({ error: 'Image introuvable ou non autorisée' });
        insert(media);
    });
});

app.get('/api/social/posts/:postId', authenticateAccount, (req, res) => {
    db.get(
        `SELECT p.*, a.identifier, a.prenom, a.name, a.avatar_media_id, mf.mime_type AS media_mime_type, mf.size_bytes AS media_size_bytes FROM social_posts p
         LEFT JOIN media_files mf ON mf.id = p.media_id
         JOIN platform_accounts a ON a.id = p.author_account_id WHERE p.id = ? AND p.deleted_at IS NULL`,
        [req.params.postId], (err, post) => {
            if (err) return res.status(500).json({ error: err.message });
            if (!post) return res.status(404).json({ error: 'Publication introuvable' });
            canSeePost(req.account.id, post, (privacyErr, allowed) => {
                if (privacyErr) return res.status(500).json({ error: privacyErr.message });
                if (!allowed) return res.status(403).json({ error: 'Publication privée' });
                if (post.moderation_status === 'pending' && Number(post.author_account_id) !== Number(req.account.id)) return res.status(404).json({ error: 'Publication en cours d’examen' });
                db.all(
                    `SELECT c.*, a.identifier, a.prenom, a.name FROM post_comments c JOIN platform_accounts a ON a.id = c.author_account_id
                     WHERE c.post_id = ? AND c.moderation_status <> 'removed' AND (c.moderation_status = 'approved' OR c.author_account_id = ?) ORDER BY c.created_at ASC`,
                    [post.id, req.account.id], (commentsErr, comments) => {
                        if (commentsErr) return res.status(500).json({ error: commentsErr.message });
                        hydratePostComments(comments, hydrateErr => {
                            if (hydrateErr) return res.status(500).json({ error: hydrateErr.message });
                            db.all(
                                'SELECT reaction, COUNT(*) AS count FROM post_reactions WHERE post_id = ? GROUP BY reaction',
                                [post.id], (reactionErr, reactions) => reactionErr ? res.status(500).json({ error: reactionErr.message }) : res.json({ post, comments, reactions })
                            );
                        });
                    }
                );
            });
        }
    );
});

app.delete('/api/social/posts/:postId', authenticateAccount, (req, res) => {
    db.run('UPDATE social_posts SET deleted_at = CURRENT_TIMESTAMP WHERE id = ? AND author_account_id = ? AND deleted_at IS NULL', [req.params.postId, req.account.id], function deletePost(err) {
        if (err) return res.status(500).json({ error: err.message });
        if (!this.changes) return res.status(404).json({ error: 'Publication introuvable ou non autorisée' });
        res.json({ deleted: true });
    });
});

app.post('/api/social/posts/:postId/reactions', authenticateAccount, (req, res) => {
    const reaction = String(req.body.reaction || '');
    if (!['👍', '❤️', '😂', '🙏', '🎉'].includes(reaction)) return res.status(400).json({ error: 'Réaction non autorisée' });
    db.get('SELECT * FROM social_posts WHERE id = ? AND deleted_at IS NULL', [req.params.postId], (err, post) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!post) return res.status(404).json({ error: 'Publication introuvable' });
        canSeePost(req.account.id, post, (privacyErr, allowed) => {
            if (privacyErr) return res.status(500).json({ error: privacyErr.message });
            if (!allowed) return res.status(403).json({ error: 'Publication privée' });
            db.run('INSERT OR IGNORE INTO post_reactions (post_id, account_id, reaction) VALUES (?, ?, ?)', [post.id, req.account.id, reaction], insertErr => insertErr ? res.status(500).json({ error: insertErr.message }) : res.status(201).json({ ok: true }));
        });
    });
});

app.post('/api/social/posts/:postId/comments', authenticateAccount, (req, res) => {
    const body = safeText(req.body.body, 800);
    const parentCommentId = req.body.parent_comment_id == null ? null : Number(req.body.parent_comment_id);
    if (!body) return res.status(400).json({ error: 'Commentaire requis' });
    if (parentCommentId !== null && !Number.isInteger(parentCommentId)) return res.status(400).json({ error: 'Réponse invalide' });
    db.get('SELECT * FROM social_posts WHERE id = ? AND deleted_at IS NULL', [req.params.postId], (err, post) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!post) return res.status(404).json({ error: 'Publication introuvable' });
        canSeePost(req.account.id, post, (privacyErr, allowed) => {
            if (privacyErr) return res.status(500).json({ error: privacyErr.message });
            if (!allowed) return res.status(403).json({ error: 'Publication privée' });
            const create = () => {
                const classification = moderationClassification(body);
                beginSocialMutation(req, res, 'social_comment', (idempotencyKey, complete) => {
                    db.run(
                        `INSERT INTO post_comments (post_id, author_account_id, body, parent_comment_id, moderation_status, moderation_reason, review_tag)
                         VALUES (?, ?, ?, ?, ?, ?, ?)`,
                        [post.id, req.account.id, body, parentCommentId, classification.status, classification.reason, classification.reviewTag],
                        function commentErr(insertErr) {
                            if (insertErr) return complete(500, { error: insertErr.message });
                            const commentId = this.lastID;
                            writeSocialSandboxCharge({
                                idempotencyKey, contentType: 'comment', contentId: commentId, chargedAccountId: req.account.id,
                                postAuthorAccountId: post.author_account_id, amountMinor: socialPrice('comment')
                            }, (chargeErr, receipt) => {
                                if (chargeErr) return complete(500, { error: chargeErr.message });
                                const respond = () => complete(201, {
                                    id: commentId, moderation_status: classification.status, review_tag: classification.reviewTag, receipt
                                });
                                if (classification.status !== 'pending') return respond();
                                db.run(
                                    `INSERT INTO social_moderation_audit (audit_id, content_type, content_id, action, reason)
                                     VALUES (?, 'comment', ?, 'queued', ?)`,
                                    [newSecureId(), commentId, classification.reason],
                                    auditErr => auditErr ? complete(500, { error: auditErr.message }) : respond()
                                );
                            });
                        }
                    );
                });
            };
            if (parentCommentId === null) return create();
            db.get('SELECT id FROM post_comments WHERE id = ? AND post_id = ? AND moderation_status <> ?', [parentCommentId, post.id, 'removed'], (parentErr, parent) => {
                if (parentErr) return res.status(500).json({ error: parentErr.message });
                if (!parent) return res.status(404).json({ error: 'Commentaire auquel répondre introuvable' });
                create();
            });
        });
    });
});

app.post('/api/social/comments/:commentId/reactions', authenticateAccount, (req, res) => {
    const reaction = String(req.body.reaction || '');
    if (!['👍', '❤️', '😂', '🙏', '🎉'].includes(reaction)) return res.status(400).json({ error: 'Réaction non autorisée' });
    db.get(
        `SELECT c.id, c.post_id, p.author_account_id, p.visibility, p.deleted_at
         FROM post_comments c JOIN social_posts p ON p.id = c.post_id
         WHERE c.id = ? AND c.moderation_status <> 'removed'`,
        [req.params.commentId],
        (err, comment) => {
            if (err) return res.status(500).json({ error: err.message });
            if (!comment || comment.deleted_at) return res.status(404).json({ error: 'Commentaire introuvable' });
            canSeePost(req.account.id, comment, (privacyErr, allowed) => {
                if (privacyErr) return res.status(500).json({ error: privacyErr.message });
                if (!allowed) return res.status(403).json({ error: 'Publication privée' });
                db.run('INSERT OR IGNORE INTO comment_reactions (comment_id, account_id, reaction) VALUES (?, ?, ?)', [comment.id, req.account.id, reaction], insertErr => insertErr ? res.status(500).json({ error: insertErr.message }) : res.status(201).json({ ok: true }));
            });
        }
    );
});

app.delete('/api/social/comments/:commentId/reactions/:reaction', authenticateAccount, (req, res) => {
    const reaction = String(req.params.reaction || '');
    if (!['👍', '❤️', '😂', '🙏', '🎉'].includes(reaction)) return res.status(400).json({ error: 'Réaction non autorisée' });
    db.get(
        `SELECT c.id, p.author_account_id, p.visibility, p.deleted_at FROM post_comments c JOIN social_posts p ON p.id = c.post_id
         WHERE c.id = ? AND c.moderation_status <> 'removed'`,
        [req.params.commentId],
        (err, comment) => {
            if (err) return res.status(500).json({ error: err.message });
            if (!comment || comment.deleted_at) return res.status(404).json({ error: 'Commentaire introuvable' });
            canSeePost(req.account.id, comment, (privacyErr, allowed) => {
                if (privacyErr) return res.status(500).json({ error: privacyErr.message });
                if (!allowed) return res.status(403).json({ error: 'Publication privée' });
                db.run('DELETE FROM comment_reactions WHERE comment_id = ? AND account_id = ? AND reaction = ?', [comment.id, req.account.id, reaction], function deleteErr(deleteErr) {
                    if (deleteErr) return res.status(500).json({ error: deleteErr.message });
                    res.json({ removed: this.changes > 0 });
                });
            });
        }
    );
});

app.post('/api/social/posts/:postId/reports', authenticateAccount, (req, res) => {
    const reason = safeText(req.body.reason, 500);
    if (!reason) return res.status(400).json({ error: 'Motif de signalement requis' });
    db.run('INSERT INTO post_reports (post_id, reporter_account_id, reason) VALUES (?, ?, ?)', [req.params.postId, req.account.id, reason], function reportErr(err) {
        if (err && err.code === 'SQLITE_CONSTRAINT') return res.status(409).json({ error: 'Cette publication est déjà signalée par votre compte' });
        if (err) return res.status(500).json({ error: err.message });
        res.status(201).json({ id: this.lastID });
    });
});

app.get('/api/media/:mediaId', authenticateAccount, (req, res) => {
    db.get(
        `SELECT mf.*, pa.visibility FROM media_files mf JOIN platform_accounts pa ON pa.id = mf.owner_account_id WHERE mf.id = ?`,
        [req.params.mediaId], (err, media) => {
            if (err) return res.status(500).json({ error: err.message });
            if (!media) return res.status(404).json({ error: 'Image introuvable' });
            const authorize = allowed => {
                if (!allowed) return res.status(403).json({ error: 'Image privée' });
                const file = path.join(UPLOADS_DIRECTORY, media.stored_name);
                if (!fs.existsSync(file)) return res.status(404).json({ error: 'Fichier introuvable' });
                res.type(media.mime_type).set('Cache-Control', 'private, max-age=3600').sendFile(file);
            };
            if (media.purpose === 'avatar') return canSeeAccount(req.account.id, { id: media.owner_account_id, visibility: media.visibility }, (privacyErr, allowed) => privacyErr ? res.status(500).json({ error: privacyErr.message }) : authorize(allowed));
            db.get('SELECT * FROM social_posts WHERE media_id = ? AND deleted_at IS NULL', [media.id], (postErr, post) => {
                if (postErr) return res.status(500).json({ error: postErr.message });
                if (!post) return authorize(Number(req.account.id) === Number(media.owner_account_id));
                canSeePost(req.account.id, post, (privacyErr, allowed) => privacyErr ? res.status(500).json({ error: privacyErr.message }) : authorize(allowed));
            });
        }
    );
});

app.post('/api/social/events', authenticateAccount, (req, res) => {
    const title = safeText(req.body.title, 120);
    const description = safeText(req.body.description || '', 1000) || null;
    const startsAt = new Date(req.body.starts_at);
    const endsAt = new Date(req.body.ends_at);
    const invitees = [...new Set((Array.isArray(req.body.invitee_ids) ? req.body.invitee_ids : []).map(Number).filter(Number.isInteger))];
    if (!title || Number.isNaN(startsAt.valueOf()) || Number.isNaN(endsAt.valueOf()) || endsAt <= startsAt) return res.status(400).json({ error: 'Événement invalide' });
    const attendees = [...new Set([req.account.id, ...invitees])];
    if (attendees.length > 50) return res.status(400).json({ error: 'Maximum 50 invités' });
    const validateInvitees = index => {
        if (index === attendees.length) return createEvent();
        if (attendees[index] === req.account.id) return validateInvitees(index + 1);
        connectedAccounts(req.account.id, attendees[index], (err, friendship) => {
            if (err) return res.status(500).json({ error: err.message });
            if (!friendship) return res.status(403).json({ error: 'Les invitations de calendrier sont réservées aux contacts connectés' });
            validateInvitees(index + 1);
        });
    };
    const createEvent = () => db.run('INSERT INTO social_events (creator_account_id, title, description, starts_at, ends_at) VALUES (?, ?, ?, ?, ?)', [req.account.id, title, description, startsAt.toISOString(), endsAt.toISOString()], function eventErr(err) {
        if (err) return res.status(500).json({ error: err.message });
        const eventId = this.lastID;
        attendees.forEach(accountId => db.run('INSERT INTO social_event_invites (event_id, account_id, response) VALUES (?, ?, ?)', [eventId, accountId, accountId === req.account.id ? 'accepted' : 'pending'], inviteErr => {
            if (inviteErr) console.error('Error creating social event invitation:', inviteErr.message);
        }));
        invitees.forEach(accountId => notifyAccount(accountId, 'social_event', `${req.account.prenom} vous a invité·e à un événement.`, 'social_event', eventId));
        res.status(201).json({ id: eventId });
    });
    validateInvitees(0);
});

app.get('/api/social/events', authenticateAccount, (req, res) => {
    db.all(
        `SELECT e.*, i.response, a.prenom AS creator_prenom, a.name AS creator_name FROM social_event_invites i
         JOIN social_events e ON e.id = i.event_id JOIN platform_accounts a ON a.id = e.creator_account_id
         WHERE i.account_id = ? ORDER BY e.starts_at ASC`,
        [req.account.id], (err, events) => err ? res.status(500).json({ error: err.message }) : res.json({ events })
    );
});

app.put('/api/social/events/:eventId/invitation', authenticateAccount, (req, res) => {
    const response = String(req.body.response || '');
    if (!['accepted', 'declined'].includes(response)) return res.status(400).json({ error: 'Réponse invalide' });
    db.run('UPDATE social_event_invites SET response = ? WHERE event_id = ? AND account_id = ?', [response, req.params.eventId, req.account.id], function responseErr(err) {
        if (err) return res.status(500).json({ error: err.message });
        if (!this.changes) return res.status(404).json({ error: 'Invitation introuvable' });
        res.json({ response });
    });
});

// Platform moderation intentionally only exposes reported public content; direct
// messages are never selected by, or available to, these administrator routes.
app.get('/api/admin/social/moderation', authenticateToken, authorizeRole(['plateforme']), (req, res) => {
    db.all(
        `SELECT 'post' AS content_type, p.id AS content_id, p.body, p.moderation_reason, p.review_tag, p.created_at,
                a.identifier, a.prenom, a.name, p.author_account_id
         FROM social_posts p JOIN platform_accounts a ON a.id = p.author_account_id
         WHERE p.moderation_status = 'pending'
         UNION ALL
         SELECT 'comment' AS content_type, c.id AS content_id, c.body, c.moderation_reason, c.review_tag, c.created_at,
                a.identifier, a.prenom, a.name, c.author_account_id
         FROM post_comments c JOIN platform_accounts a ON a.id = c.author_account_id
         WHERE c.moderation_status = 'pending'
         ORDER BY created_at ASC`,
        [],
        (err, items) => err ? res.status(500).json({ error: err.message }) : res.json({
            items,
            limitations: 'File d’examen fondée sur des mots-clés déterministes; ce n’est pas une détection par IA. Le contenu politique peut être étiqueté pour examen facultatif, sans pénalité automatique.'
        })
    );
});

app.post('/api/admin/social/moderation/:contentType/:contentId', authenticateToken, authorizeRole(['plateforme']), (req, res) => {
    const contentType = String(req.params.contentType);
    const action = String(req.body.action || '');
    const reason = safeText(req.body.reason, 500);
    if (!['post', 'comment'].includes(contentType) || !['approve', 'remove', 'ban'].includes(action) || !reason) {
        return res.status(400).json({ error: 'Type, décision (approve, remove ou ban) et motif d’examen manuel requis' });
    }
    const table = contentType === 'post' ? 'social_posts' : 'post_comments';
    db.get(`SELECT id, author_account_id FROM ${table} WHERE id = ?`, [req.params.contentId], (lookupErr, content) => {
        if (lookupErr) return res.status(500).json({ error: lookupErr.message });
        if (!content) return res.status(404).json({ error: 'Contenu introuvable' });
        const status = action === 'approve' ? 'approved' : 'removed';
        db.run(
            `UPDATE ${table} SET moderation_status = ?, moderation_reason = ? WHERE id = ?`,
            [status, reason, content.id],
            updateErr => {
                if (updateErr) return res.status(500).json({ error: updateErr.message });
                const audit = () => db.run(
                    `INSERT INTO social_moderation_audit (audit_id, content_type, content_id, action, actor_member_id, reason)
                     VALUES (?, ?, ?, ?, ?, ?)`,
                    [newSecureId(), contentType, content.id, action === 'approve' ? 'approved' : action === 'remove' ? 'removed' : 'banned', req.user.id, reason],
                    auditErr => auditErr ? res.status(500).json({ error: auditErr.message }) : res.json({ action, content_type: contentType, content_id: content.id })
                );
                if (action !== 'ban') return audit();
                db.run('UPDATE platform_accounts SET status = ? WHERE id = ?', ['suspended', content.author_account_id], banErr => banErr ? res.status(500).json({ error: banErr.message }) : audit());
            }
        );
    });
});

app.get('/api/admin/social/reports', authenticateToken, authorizeRole(['plateforme']), (req, res) => {
    db.all(
        `SELECT r.*, p.body, p.visibility, p.created_at AS post_created_at, a.identifier, a.prenom, a.name
         FROM post_reports r JOIN social_posts p ON p.id = r.post_id JOIN platform_accounts a ON a.id = p.author_account_id
         WHERE r.status = 'open' ORDER BY r.created_at ASC`,
        [], (err, reports) => err ? res.status(500).json({ error: err.message }) : res.json({ reports })
    );
});
app.delete('/api/admin/social/posts/:postId', authenticateToken, authorizeRole(['plateforme']), (req, res) => {
    const reason = safeText(req.body.reason, 500) || 'Suppression manuelle par la plateforme (motif non renseigné).';
    db.run('UPDATE social_posts SET deleted_at = CURRENT_TIMESTAMP, moderation_status = ?, moderation_reason = ? WHERE id = ? AND deleted_at IS NULL', ['removed', reason, req.params.postId], function removePost(err) {
        if (err) return res.status(500).json({ error: err.message });
        if (!this.changes) return res.status(404).json({ error: 'Publication introuvable' });
        db.run('UPDATE post_reports SET status = ? WHERE post_id = ?', ['resolved', req.params.postId], () => {
            db.run(
                `INSERT INTO social_moderation_audit (audit_id, content_type, content_id, action, actor_member_id, reason)
                 VALUES (?, 'post', ?, 'removed', ?, ?)`,
                [newSecureId(), req.params.postId, req.user.id, reason],
                () => res.json({ removed: true })
            );
        });
    });
});
app.put('/api/admin/social/reports/:reportId', authenticateToken, authorizeRole(['plateforme']), (req, res) => {
    db.run('UPDATE post_reports SET status = ? WHERE id = ?', ['resolved', req.params.reportId], function resolveReport(err) {
        if (err) return res.status(500).json({ error: err.message });
        if (!this.changes) return res.status(404).json({ error: 'Signalement introuvable' });
        res.json({ resolved: true });
    });
});

function start(port = PORT) {
    return databaseReady.then(() => new Promise(resolve => {
        const server = app.listen(port, () => {
            console.log(`Server running on http://localhost:${server.address().port}`);
            resolve(server);
        });
    }));
}

module.exports = { app, db, start, SANDBOX_PAYMENT_ADAPTER };
