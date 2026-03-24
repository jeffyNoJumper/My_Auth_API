require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const crypto = require('crypto');
const bcrypt = require("bcryptjs");
const cors = require('cors');
const dns = require('dns').promises;
const { createDiscordInteractionsHandler, initDiscordBot, getDiscordBotStatus } = require('./discordBot');

const fixDates = (data) => {
    for (let key in data) {
        // Check if the value is the MongoDB {$date: ...} object
        if (data[key] && typeof data[key] === 'object' && data[key].$date) {
            data[key] = new Date(data[key].$date);
        }
    }
    return data;
};

// --- 1. HANDLE MODELS SAFELY ---
if (mongoose.models.User) delete mongoose.models.User;

const User = require('../core/user');
const AdminUser = require('../core/adminUser');

const app = express();

app.post('/discord/interactions', express.raw({ type: 'application/json' }), createDiscordInteractionsHandler({ User, mongoose }));

// --- 2. MIDDLEWARE ---
app.use(express.json({ limit: '75mb' }));
app.use(express.urlencoded({ limit: '75mb', extended: true }));
app.use(cors());

// --- 3. DATABASE CONNECTION ---
mongoose.connect(process.env.MONGO_URL) // <- remove old options
    .then(async () => {
        console.log('✅ MongoDB Connected');
        await ensureBootstrapAdmin();
    })
    .catch(err => console.error('❌ MongoDB Connection Error:', err));

const ADMIN_SESSION_DURATION_MS = 30 * 24 * 60 * 60 * 1000;
const DEFAULT_OWNER_EMAIL = process.env.ADMIN_OWNER_EMAIL || 'owner@vexion.local';
const DEFAULT_OWNER_LABEL = process.env.ADMIN_OWNER_LABEL || 'VEXION Owner';
const DEFAULT_OWNER_LOGIN = process.env.ADMIN_OWNER_LOGIN || 'owner';

function normalizeAdminLoginName(value) {
    return String(value || '')
        .trim()
        .toLowerCase()
        .replace(/\s+/g, '');
}

function isValidAdminLoginName(value) {
    return /^[a-z0-9_.-]{3,24}$/.test(String(value || ''));
}

function normalizeAdminPin(value) {
    return String(value || '').trim();
}

function isValidAdminPin(value) {
    return /^\d{4}$/.test(String(value || ''));
}

function getAdminAuthCollection() {
    return mongoose.connection.collection('admin_auth_logins');
}

function hashAdminSessionToken(token) {
    return crypto.createHash('sha256').update(String(token || '')).digest('hex');
}

async function ensureBootstrapAdmin() {
    try {
        const ownerEmail = String(DEFAULT_OWNER_EMAIL || '').toLowerCase().trim();
        const ownerPassword = String(process.env.ADMIN_OWNER_PASSWORD || process.env.ADMIN_SECRET || '').trim();
        const ownerLabel = String(DEFAULT_OWNER_LABEL || 'VEXION Owner').trim() || 'VEXION Owner';
        const ownerLoginName = normalizeAdminLoginName(DEFAULT_OWNER_LOGIN || 'owner');
        const ownerPin = normalizeAdminPin(process.env.ADMIN_OWNER_PIN || '');

        if (!ownerEmail || !ownerPassword) {
            console.warn('[ADMIN BOOTSTRAP] Skipped: owner email or password is missing.');
            return;
        }

        const existingOwner = await AdminUser.findOne({ email: ownerEmail });
        if (existingOwner) {
            const updates = {};

            if (!existingOwner.label && ownerLabel) {
                updates.label = ownerLabel;
            }

            if (!existingOwner.login_name && ownerLoginName && isValidAdminLoginName(ownerLoginName)) {
                updates.login_name = ownerLoginName;
            }

            if (!existingOwner.pin_hash && ownerPin && isValidAdminPin(ownerPin)) {
                updates.pin_hash = await bcrypt.hash(ownerPin, 12);
                updates.quick_login_enabled = true;
            }

            if (existingOwner.pin_hash && !existingOwner.quick_login_enabled) {
                updates.quick_login_enabled = true;
            }

            if (Object.keys(updates).length) {
                await AdminUser.updateOne({ _id: existingOwner._id }, { $set: updates });
            }

            return;
        }

        const passwordHash = await bcrypt.hash(ownerPassword, 12);
        const bootstrapDoc = {
            email: ownerEmail,
            password_hash: passwordHash,
            label: ownerLabel,
            login_name: isValidAdminLoginName(ownerLoginName) ? ownerLoginName : null,
            pin_hash: ownerPin && isValidAdminPin(ownerPin) ? await bcrypt.hash(ownerPin, 12) : null,
            quick_login_enabled: Boolean(ownerPin && isValidAdminPin(ownerPin)),
            role: 'owner',
            is_active: true,
            created_by: 'bootstrap'
        };

        await AdminUser.create(bootstrapDoc);

        console.log(`[ADMIN BOOTSTRAP] Owner account ready: ${ownerEmail}`);
    } catch (error) {
        console.error('[ADMIN BOOTSTRAP ERROR]', error);
    }
}

async function resolveAdminSession(sessionToken) {
    if (!sessionToken) {
        return null;
    }

    const sessions = getAdminAuthCollection();
    const tokenHash = hashAdminSessionToken(sessionToken);
    const now = new Date();
    const session = await sessions.findOne({
        token_hash: tokenHash,
        revoked_at: null,
        expires_at: { $gt: now }
    });

    if (!session) {
        return null;
    }

    const adminUser = session.admin_user_id
        ? await AdminUser.findById(session.admin_user_id).lean()
        : null;

    if (!adminUser || !adminUser.is_active) {
        await sessions.updateOne(
            { _id: session._id },
            {
                $set: {
                    revoked_at: now,
                    status: 'REVOKED'
                }
            }
        );
        return null;
    }

    await sessions.updateOne(
        { _id: session._id },
        {
            $set: {
                last_used_at: now,
                admin_label: adminUser.label || session.admin_label || 'VEXION Admin'
            },
            $inc: { use_count: 1 }
        }
    );

    return {
        ...session,
        admin_user_id: String(adminUser._id),
        admin_email: adminUser.email,
        admin_login_name: adminUser.login_name || '',
        admin_label: adminUser.label || session.admin_label || 'VEXION Admin',
        admin_role: adminUser.role || 'admin',
        last_used_at: now
    };
}

async function verifyAdmin(req, res, next) {
    try {
        const adminPassword = String(req.body?.admin_password || '').trim();

        if (adminPassword && adminPassword === process.env.ADMIN_SECRET) {
            req.adminAuth = { mode: 'secret', label: 'ADMIN_SECRET', role: 'owner', email: DEFAULT_OWNER_EMAIL };
            return next();
        }

        const sessionToken = String(req.body?.admin_session_token || req.get('x-admin-session-token') || '').trim();
        const session = await resolveAdminSession(sessionToken);

        if (!session) {
            return res.status(401).json({ success: false, error: "Unauthorized" });
        }

        req.adminAuth = {
            mode: 'session',
            label: session.admin_label || 'Admin',
            email: session.admin_email || '',
            role: session.admin_role || 'admin',
            admin_user_id: session.admin_user_id || '',
            session_id: String(session._id)
        };

        return next();
    } catch (error) {
        console.error('[ADMIN AUTH ERROR]', error);
        return res.status(500).json({ success: false, error: "Admin authentication failed" });
    }
}

function requireOwner(req, res, next) {
    if (req.adminAuth?.role !== 'owner' && req.adminAuth?.mode !== 'secret') {
        return res.status(403).json({ success: false, error: 'Owner access required.' });
    }

    return next();
}

function applyDuration(baseDate, daysValue) {
    const targetDate = new Date(baseDate);
    const parsedDays = parseFloat(daysValue);

    if (Number.isNaN(parsedDays)) {
        return targetDate;
    }

    if (parsedDays >= 999) {
        targetDate.setFullYear(targetDate.getFullYear() + 50);
        return targetDate;
    }

    const durationMs = Math.round(parsedDays * 24 * 60 * 60 * 1000);
    targetDate.setTime(targetDate.getTime() + durationMs);
    return targetDate;
}

function normalizeGamesInput(games) {
    if (Array.isArray(games)) {
        return games.filter(Boolean);
    }

    if (typeof games === 'string' && games.trim()) {
        return [games.trim()];
    }

    return [];
}

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const blockedEmailDomains = new Set([
    'mailinator.com',
    'guerrillamail.com',
    '10minutemail.com',
    'temp-mail.org',
    'tempmail.com',
    'getnada.com',
    'moakt.com',
    'moakt.cc',
    'mail.tm',
    'sharklasers.com',
    'yopmail.com',
    'mintemail.com',
    'dispostable.com',
    'throwawaymail.com',
    'trashmail.com',
    'fakeinbox.com',
    'emailondeck.com',
    'minuteinbox.com',
    'tempmailo.com',
    'spamgourmet.com'
]);

async function validateEmailAddress(email) {
    const cleanEmail = String(email || '').toLowerCase().trim();

    if (!cleanEmail || !emailRegex.test(cleanEmail)) {
        return { valid: false, reason: 'invalid_format' };
    }

    const [, domain = ""] = cleanEmail.split('@');
    if (!domain) {
        return { valid: false, reason: 'invalid_domain' };
    }

    if (blockedEmailDomains.has(domain)) {
        return { valid: false, reason: 'disposable_domain' };
    }

    try {
        const mxRecords = await dns.resolveMx(domain);
        if (Array.isArray(mxRecords) && mxRecords.length > 0) {
            return { valid: true };
        }
    } catch (mxError) {
        try {
            const [ipv4Records, ipv6Records] = await Promise.allSettled([
                dns.resolve4(domain),
                dns.resolve6(domain)
            ]);

            const hasFallbackRecords =
                (ipv4Records.status === 'fulfilled' && ipv4Records.value.length > 0) ||
                (ipv6Records.status === 'fulfilled' && ipv6Records.value.length > 0);

            if (hasFallbackRecords) {
                return { valid: true };
            }
        } catch (fallbackError) {
            console.warn('[EMAIL DNS FALLBACK ERROR]', fallbackError);
        }

        console.warn('[EMAIL MX LOOKUP FAILED]', domain, mxError?.message || mxError);
        return { valid: false, reason: 'mail_domain_unreachable' };
    }

    return { valid: false, reason: 'mail_domain_unreachable' };
}

function getEmailValidationMessage(reason) {
    switch (reason) {
        case 'invalid_format':
            return 'Enter a valid email address.';
        case 'disposable_domain':
            return 'Disposable or temporary email addresses are not allowed.';
        case 'mail_domain_unreachable':
            return 'That email domain is not configured to receive mail. Use a real inbox.';
        default:
            return 'Email validation failed.';
    }
}

function generateLicenseKey(games) {
    const gamePrefixMap = {
        "CS2": "CS2X",
        "FiveM": "FIVM",
        "GTAV": "GTAV",
        "Warzone": "WARZ",
        "All-Access": "ALLX"
    };

    const firstGame = normalizeGamesInput(games)[0];
    const prefix = gamePrefixMap[firstGame] || "GENR";
    const randomPart = crypto.randomBytes(6).toString('hex').toUpperCase().match(/.{4}/g).join('-');
    return `${prefix}-${randomPart}`;
}

function buildPendingVoucherEmail(key) {
    return `pending_${String(key || '').toLowerCase()}`;
}

async function getNextHwidTicketNumber() {
    const counterDoc = await mongoose.connection.collection('counters').findOneAndUpdate(
        { _id: 'hwid_reset_ticket' },
        { $inc: { value: 1 } },
        { upsert: true, returnDocument: 'after', includeResultMetadata: false }
    );

    return Number(counterDoc?.value || 1);
}

async function ensureHwidTicketNumber(requestsCollection, requestDoc) {
    const existingTicket = Number(requestDoc?.ticket_number);

    if (Number.isFinite(existingTicket) && existingTicket > 0) {
        return existingTicket;
    }

    const nextTicket = await getNextHwidTicketNumber();

    if (requestDoc?._id) {
        await requestsCollection.updateOne(
            { _id: requestDoc._id },
            { $set: { ticket_number: nextTicket } }
        );
    }

    return nextTicket;
}

const DISCORD_LOADER_ALERT_CHANNEL_ID = process.env.DISCORD_LOADER_ALERT_CHANNEL_ID || "1373760247658971256";
const DISCORD_REDEEM_LOG_CHANNEL_ID = process.env.DISCORD_REDEEM_LOG_CHANNEL_ID || "1374477027247394866";

function getDiscordBotToken() {
    return process.env.DISCORD_BOT_TOKEN || process.env.DISCORD_TOKEN || process.env.TOKEN || "";
}

function trimAnnouncementText(value, maxLength = 240) {
    const clean = String(value || "")
        .replace(/\s+/g, ' ')
        .trim();

    if (!clean) {
        return "";
    }

    return clean.length > maxLength
        ? `${clean.slice(0, maxLength - 3).trimEnd()}...`
        : clean;
}

function buildDiscordAnnouncementPayload(message) {
    const firstEmbed = Array.isArray(message?.embeds) ? message.embeds[0] : null;
    const firstField = Array.isArray(firstEmbed?.fields) ? firstEmbed.fields[0] : null;
    const authorName = trimAnnouncementText(
        message?.author?.global_name
        || message?.author?.username
        || firstEmbed?.author?.name
        || "Admin",
        80
    );
    const title = trimAnnouncementText(
        firstEmbed?.title
        || message?.content
        || firstEmbed?.description
        || firstField?.name
        || "New Admin Notice",
        120
    );
    const detail = trimAnnouncementText(
        message?.content
        || firstEmbed?.description
        || firstField?.value
        || title,
        320
    );

    return {
        id: String(message?.id || ""),
        title: title || "New Admin Notice",
        detail: detail || "A new admin notice was posted.",
        author: authorName,
        timestamp: message?.timestamp || new Date().toISOString()
    };
}

async function fetchLatestDiscordAnnouncement() {
    const botToken = getDiscordBotToken();

    if (!botToken) {
        return { enabled: false, reason: "missing_bot_token" };
    }

    const response = await fetch(`https://discord.com/api/v10/channels/${DISCORD_LOADER_ALERT_CHANNEL_ID}/messages?limit=1`, {
        headers: {
            Authorization: `Bot ${botToken}`,
            'User-Agent': 'VEXION-Loader/1.0'
        }
    });

    if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`Discord API ${response.status}: ${errorBody.slice(0, 180)}`);
    }

    const messages = await response.json();
    const latestMessage = Array.isArray(messages) ? messages[0] : null;

    if (!latestMessage) {
        return { enabled: true, channel_id: DISCORD_LOADER_ALERT_CHANNEL_ID, announcement: null };
    }

    return {
        enabled: true,
        channel_id: DISCORD_LOADER_ALERT_CHANNEL_ID,
        announcement: buildDiscordAnnouncementPayload(latestMessage)
    };
}

async function fetchLatestStoredLoaderAnnouncement() {
    try {
        const latest = await mongoose.connection
            .collection('loader_notifications')
            .findOne({}, { sort: { created_at: -1 } });

        if (!latest) {
            return null;
        }

        return {
            enabled: true,
            channel_id: DISCORD_LOADER_ALERT_CHANNEL_ID,
            announcement: {
                id: String(latest._id || ""),
                title: trimAnnouncementText(latest.title || "New Admin Notice", 120),
                detail: trimAnnouncementText(latest.detail || latest.message || "A new admin notice was posted.", 320),
                author: trimAnnouncementText(latest.author || "Admin", 80),
                timestamp: latest.timestamp || latest.created_at || new Date().toISOString()
            }
        };
    } catch (error) {
        console.error("[LOADER NOTIFICATION STORE ERROR]", error);
        return null;
    }
}

async function fetchLatestLoaderAnnouncement() {
    const storedPayload = await fetchLatestStoredLoaderAnnouncement();

    if (storedPayload?.announcement?.id) {
        return storedPayload;
    }

    return fetchLatestDiscordAnnouncement();
}

function formatDiscordLogValue(value, fallback = "Not Set") {
    const clean = String(value ?? "").trim();
    return clean ? `\`${clean.slice(0, 1000)}\`` : `\`${fallback}\``;
}

function formatRedeemDuration(daysValue) {
    const days = Number(daysValue);

    if (!Number.isFinite(days) || days <= 0) {
        return "Unknown";
    }

    if (days >= 999) {
        return "Lifetime";
    }

    if (days < 1) {
        const hours = Math.round(days * 24 * 100) / 100;
        return `${hours} Hours`;
    }

    if (Number.isInteger(days)) {
        return `${days} Days`;
    }

    return `${Math.round(days * 100) / 100} Days`;
}

async function postDiscordChannelEmbed(channelId, embedPayload) {
    const botToken = getDiscordBotToken();

    if (!botToken || !channelId) {
        return false;
    }

    const response = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
        method: 'POST',
        headers: {
            Authorization: `Bot ${botToken}`,
            'Content-Type': 'application/json',
            'User-Agent': 'VEXION-Loader/1.0'
        },
        body: JSON.stringify({
            embeds: [embedPayload]
        })
    });

    if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`Discord API ${response.status}: ${errorBody.slice(0, 300)}`);
    }

    return true;
}

async function sendRedeemDiscordLog({ email, hwid, user, voucher, daysToAdd, sourceKey }) {
    const games = Array.isArray(user?.games) && user.games.length
        ? user.games.join(', ')
        : 'General';
    const embedPayload = {
        title: 'Loader Key Redeemed',
        description: 'A user redeemed a subscription key from the loader profile panel.',
        color: 0x22C55E,
        timestamp: new Date().toISOString(),
        fields: [
            { name: 'Redeemed By', value: formatDiscordLogValue(email, 'Unknown User'), inline: false },
            { name: 'License Key', value: formatDiscordLogValue(sourceKey || user?.license_key, 'Unknown Key'), inline: false },
            { name: 'Time Added', value: formatDiscordLogValue(formatRedeemDuration(daysToAdd), 'Unknown'), inline: true },
            { name: 'New Expiry', value: formatDiscordLogValue(user?.expiry_date ? new Date(user.expiry_date).toLocaleString() : 'Pending'), inline: true },
            { name: 'Games', value: formatDiscordLogValue(games, 'No Access'), inline: false },
            { name: 'HWID', value: formatDiscordLogValue(hwid || user?.hwid || 'Not Captured'), inline: false }
        ],
        footer: {
            text: 'VEXION Redeem Log'
        }
    };

    if (voucher?.reserved_email) {
        embedPayload.fields.splice(1, 0, {
            name: 'Reserved Email',
            value: formatDiscordLogValue(voucher.reserved_email, 'None'),
            inline: false
        });
    }

    return postDiscordChannelEmbed(DISCORD_REDEEM_LOG_CHANNEL_ID, embedPayload);
}

app.post('/admin-auth/login', async (req, res) => {
    try {
        const adminEmail = String(req.body?.admin_email || '').toLowerCase().trim();
        const adminPassword = String(req.body?.admin_password || '').trim();
        const adminLoginName = normalizeAdminLoginName(req.body?.admin_login_name || '');
        const adminPin = normalizeAdminPin(req.body?.admin_pin || '');
        const deviceInfo = String(req.body?.device_info || '').trim() || 'Unknown Device';
        const usingQuickLogin = Boolean(adminLoginName || adminPin);

        if (usingQuickLogin && (!adminLoginName || !adminPin)) {
            return res.status(400).json({ success: false, error: 'Enter both admin username and 4-digit PIN.' });
        }

        if (!usingQuickLogin && (!adminEmail || !adminPassword)) {
            return res.status(400).json({ success: false, error: 'Admin email and password are required.' });
        }

        let adminUser = null;

        if (usingQuickLogin) {
            adminUser = await AdminUser.findOne({ login_name: adminLoginName });
        } else {
            adminUser = await AdminUser.findOne({ email: adminEmail });
        }

        if (!adminUser || !adminUser.is_active) {
            return res.status(401).json({ success: false, error: 'Invalid admin credentials.' });
        }

        if (usingQuickLogin) {
            if (!adminUser.last_login_at) {
                return res.status(403).json({ success: false, error: 'Use email and password for the first admin login on this account.' });
            }

            if (!adminUser.quick_login_enabled || !adminUser.pin_hash) {
                return res.status(403).json({ success: false, error: 'Quick login is not enabled for this admin account yet.' });
            }

            const pinValid = await bcrypt.compare(adminPin, adminUser.pin_hash);
            if (!pinValid) {
                return res.status(401).json({ success: false, error: 'Invalid admin credentials.' });
            }
        } else {
            const passwordValid = await bcrypt.compare(adminPassword, adminUser.password_hash);
            if (!passwordValid) {
                return res.status(401).json({ success: false, error: 'Invalid admin credentials.' });
            }
        }

        const sessions = getAdminAuthCollection();
        const sessionToken = crypto.randomBytes(32).toString('hex');
        const now = new Date();
        const expiresAt = new Date(now.getTime() + ADMIN_SESSION_DURATION_MS);

        const sessionRecord = {
            token_hash: hashAdminSessionToken(sessionToken),
            admin_user_id: String(adminUser._id),
            admin_email: adminUser.email,
            admin_login_name: adminUser.login_name || '',
            admin_label: adminUser.label || 'VEXION Admin',
            admin_role: adminUser.role || 'admin',
            device_info: deviceInfo,
            source: 'admin_panel',
            login_method: usingQuickLogin ? 'username_pin' : 'email_password',
            created_at: now,
            last_used_at: now,
            expires_at: expiresAt,
            revoked_at: null,
            use_count: 1,
            user_agent: req.get('user-agent') || '',
            remote_ip: req.ip || req.socket?.remoteAddress || '',
            status: 'ACTIVE'
        };

        const insertResult = await sessions.insertOne(sessionRecord);
        await AdminUser.updateOne(
            { _id: adminUser._id },
            { $set: { last_login_at: now } }
        );

        return res.json({
            success: true,
            session_token: sessionToken,
            admin_email: adminUser.email,
            admin_login_name: adminUser.login_name || '',
            admin_label: adminUser.label || 'VEXION Admin',
            admin_role: adminUser.role || 'admin',
            device_info: deviceInfo,
            expires_at: expiresAt,
            session_id: String(insertResult.insertedId)
        });
    } catch (error) {
        console.error('[ADMIN AUTH LOGIN ERROR]', error);
        return res.status(500).json({ success: false, error: 'Failed to create admin session.' });
    }
});

app.post('/admin-auth/restore', async (req, res) => {
    try {
        const sessionToken = String(req.body?.admin_session_token || '').trim();
        const session = await resolveAdminSession(sessionToken);

        if (!session) {
            return res.status(401).json({ success: false, error: 'Saved admin session expired or is invalid.' });
        }

        return res.json({
            success: true,
            admin_email: session.admin_email || '',
            admin_login_name: session.admin_login_name || '',
            admin_label: session.admin_label || 'VEXION Admin',
            admin_role: session.admin_role || 'admin',
            device_info: session.device_info || 'Unknown Device',
            expires_at: session.expires_at,
            session_id: String(session._id)
        });
    } catch (error) {
        console.error('[ADMIN AUTH RESTORE ERROR]', error);
        return res.status(500).json({ success: false, error: 'Failed to restore admin session.' });
    }
});

app.post('/admin-auth/create-admin', verifyAdmin, requireOwner, async (req, res) => {
    try {
        const adminEmail = String(req.body?.email || '').toLowerCase().trim();
        const adminPassword = String(req.body?.password || '').trim();
        const adminLoginName = normalizeAdminLoginName(req.body?.login_name || '');
        const adminPin = normalizeAdminPin(req.body?.pin || '');
        const adminLabel = String(req.body?.label || '').trim() || adminEmail;

        if (!adminEmail || !adminPassword || !adminLoginName || !adminPin) {
            return res.status(400).json({ success: false, error: 'Admin username, email, password, and 4-digit PIN are required.' });
        }

        if (!emailRegex.test(adminEmail)) {
            return res.status(400).json({ success: false, error: 'Enter a valid admin email address.' });
        }

        if (!isValidAdminLoginName(adminLoginName)) {
            return res.status(400).json({ success: false, error: 'Admin username must be 3-24 characters using letters, numbers, dot, dash, or underscore.' });
        }

        if (!isValidAdminPin(adminPin)) {
            return res.status(400).json({ success: false, error: 'Admin PIN must be exactly 4 digits.' });
        }

        const existingAdmin = await AdminUser.findOne({ email: adminEmail });
        if (existingAdmin) {
            return res.status(400).json({ success: false, error: 'An admin with that email already exists.' });
        }

        const existingLoginName = await AdminUser.findOne({ login_name: adminLoginName });
        if (existingLoginName) {
            return res.status(400).json({ success: false, error: 'That admin username is already in use.' });
        }

        const passwordHash = await bcrypt.hash(adminPassword, 12);
        const pinHash = await bcrypt.hash(adminPin, 12);
        const createdAdmin = await AdminUser.create({
            email: adminEmail,
            password_hash: passwordHash,
            login_name: adminLoginName,
            pin_hash: pinHash,
            quick_login_enabled: true,
            label: adminLabel,
            role: 'admin',
            is_active: true,
            created_by: req.adminAuth?.email || req.adminAuth?.label || 'owner'
        });

        return res.json({
            success: true,
            admin: {
                id: String(createdAdmin._id),
                email: createdAdmin.email,
                login_name: createdAdmin.login_name || '',
                label: createdAdmin.label,
                role: createdAdmin.role
            },
            message: `Admin login created for ${createdAdmin.email}. First login uses email/password, then ${createdAdmin.login_name} + PIN can be used.`
        });
    } catch (error) {
        console.error('[ADMIN CREATE ERROR]', error);
        return res.status(500).json({ success: false, error: 'Failed to create admin login.' });
    }
});

app.post('/admin-auth/logout', async (req, res) => {
    try {
        const sessionToken = String(req.body?.admin_session_token || '').trim();
        if (!sessionToken) {
            return res.json({ success: true });
        }

        await getAdminAuthCollection().updateOne(
            { token_hash: hashAdminSessionToken(sessionToken), revoked_at: null },
            {
                $set: {
                    revoked_at: new Date(),
                    status: 'REVOKED'
                }
            }
        );

        return res.json({ success: true });
    } catch (error) {
        console.error('[ADMIN AUTH LOGOUT ERROR]', error);
        return res.status(500).json({ success: false, error: 'Failed to close admin session.' });
    }
});

// --- 2. CREATE KEY ---
app.post('/admin/create-key', verifyAdmin, async (req, res) => {
    try {
        const { days, games, email, password, pre_register } = req.body;
        const daysNum = parseFloat(days);
        const normalizedDays = Number.isNaN(daysNum) ? 30 : daysNum;
        const normalizedGames = normalizeGamesInput(games);
        const cleanEmail = typeof email === 'string' ? email.toLowerCase().trim() : "";
        const cleanPassword = typeof password === 'string' ? password.trim() : "";
        const shouldPreRegister = Boolean(pre_register);

        if (shouldPreRegister && !cleanEmail) {
            return res.status(400).json({ success: false, error: "Email is required when pre-register is enabled." });
        }

        if (cleanEmail) {
            const emailCheck = await validateEmailAddress(cleanEmail);
            if (!emailCheck.valid) {
                return res.status(400).json({
                    success: false,
                    error: getEmailValidationMessage(emailCheck.reason),
                    code: 'invalid_email'
                });
            }
        }

        const newKey = generateLicenseKey(normalizedGames);
        const voucherRecord = new User({
            license_key: newKey,
            duration_days: normalizedDays,
            games: normalizedGames,
            email: buildPendingVoucherEmail(newKey),
            password: null,
            hwid: null,
            expiry_date: null,
            reserved_email: cleanEmail || null
        });

        let existingUser = null;
        let accountCreated = false;

        if (cleanEmail) {
            existingUser = await User.findOne({ email: cleanEmail });
        }

        if (shouldPreRegister) {
            if (existingUser) {
                if (!existingUser.password && cleanPassword) {
                    existingUser.password = cleanPassword;
                    await existingUser.save();
                }
            } else {
                const preregisteredUser = new User({
                    email: cleanEmail,
                    password: cleanPassword || null,
                    hwid: null,
                    games: [],
                    expiry_date: null,
                    license_key: null,
                    duration_days: normalizedDays
                });

                await preregisteredUser.save();
                existingUser = preregisteredUser;
                accountCreated = true;
            }
        }

        await voucherRecord.save();

        res.json({
            success: true,
            key: newKey,
            expiry: null,
            games: voucherRecord.games,
            email: cleanEmail || null,
            reserved_email: cleanEmail || null,
            pre_registered: shouldPreRegister,
            account_created: accountCreated,
            requires_password_setup: shouldPreRegister && !cleanPassword,
            mode: shouldPreRegister
                ? (accountCreated ? 'pre-registered-new-user' : 'pre-registered-existing-user')
                : (cleanEmail ? 'reserved-key' : 'standalone-key'),
            message: shouldPreRegister
                ? (accountCreated
                    ? "Pre-registered account created. User can finish login setup and redeem the key in the loader."
                    : "Key generated for the selected email. Existing account can redeem it in the loader.")
                : (cleanEmail
                    ? "Standalone key generated and reserved to the entered email."
                    : "Standalone redeemable key generated.")
        });
    } catch (err) {
        console.error("Create Key Error:", err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// --- ADMIN: UNIFIED MANAGEMENT ---
app.post('/admin/:action', verifyAdmin, async (req, res) => {
    const safeJson = (obj) => res.json(obj);

    try {
        const { license_key, email, password, profile_pic } = req.body;

        const rawAction = req.params.action ? req.params.action.toLowerCase().trim() : "";
        console.log(`[ADMIN] Incoming Action: ${rawAction}`);

        // HANDLE LOAD-KEYS FIRST
        if (rawAction === 'load-keys') {
            console.log("[ADMIN] Success: Running load-keys logic...");
            try {
                const keys = await User.find({}, 'license_key email reserved_email expiry_date is_banned is_paused games')
                    .sort({ updatedAt: -1, createdAt: -1 })
                    .lean();
                return safeJson({
                    success: true,
                    keys: keys.map(k => ({
                        license_key: k.license_key,
                        identifier: k.license_key || k.email || "",
                        email: k.email || "No Email",
                        reserved_email: k.reserved_email || "",
                        expiry: k.expiry_date,
                        is_banned: k.is_banned || false,
                        is_paused: k.is_paused || false,
                        games: k.games || []
                    }))
                });
            } catch (err) {
                console.error("[ADMIN] DB Error:", err);
                return safeJson({ success: false, error: "Failed to load keys from database" });
            }
        }

        const cleanAction = rawAction.replace('-key', '').trim();

        let user = null;

        const identifier = req.body.identifier || license_key;
        const normalizedIdentifier = typeof identifier === 'string' ? identifier.trim() : "";

        if (normalizedIdentifier) {
            const clean = normalizedIdentifier;

            if (clean.includes("@")) {
                // Lookup by email
                user = await User.findOne({ email: clean.toLowerCase() });
            } else {
                // Lookup by license key
                user = await User.findOne({ license_key: clean.toUpperCase() });
            }
        }

        if (!user && cleanAction !== 'delete') {
            return safeJson({ success: false, error: "User not found" });
        }

        const resolvedLicenseKey = user?.license_key
            ? user.license_key.toUpperCase()
            : normalizedIdentifier && !normalizedIdentifier.includes("@")
                ? normalizedIdentifier.toUpperCase()
                : null;

        if (cleanAction === 'add-time' || cleanAction === 'remove-time') {
            const requestedDays = parseFloat(req.body.days);

            if (isNaN(requestedDays) || requestedDays <= 0) {
                return res.status(400).json({ success: false, error: "Invalid days value" });
            }

            const isRemoveAction = cleanAction === 'remove-time';
            const signedDays = isRemoveAction ? -requestedDays : requestedDays;
            const currentExpiry = user.expiry_date ? new Date(user.expiry_date) : new Date();
            const baseDate = isRemoveAction
                ? currentExpiry
                : ((currentExpiry > new Date()) ? currentExpiry : new Date());
            const newExpiry = applyDuration(baseDate, signedDays);

            user.expiry_date = newExpiry;
            await user.save();

            console.log(`[ADMIN] Successfully ${isRemoveAction ? 'removed' : 'added'} ${requestedDays} days ${isRemoveAction ? 'from' : 'to'}: ${resolvedLicenseKey || normalizedIdentifier}`);
            return res.json({
                success: true,
                message: isRemoveAction
                    ? `Removed ${requestedDays} days. New Expiry: ${newExpiry.toLocaleDateString()}`
                    : (requestedDays >= 999
                        ? `Set lifetime expiry: ${newExpiry.toLocaleDateString()}`
                        : `Added ${requestedDays} days. New Expiry: ${newExpiry.toLocaleDateString()}`),
                new_expiry: newExpiry
            });
        }

        switch (cleanAction) {
            case 'update':
                if (email) user.email = email.toLowerCase();
                if (password) user.password = password;
                await user.save();
                return safeJson({ success: true, message: `Linked ${email} successfully.` });

            case 'update-pfp':
                user.profile_pic = profile_pic;
                await user.save();
                return safeJson({ success: true, message: "PFP Updated" });

            case 'get':
            case 'get-key':
                let pendingRequest = null;
                try {
                    if (resolvedLicenseKey) {
                        pendingRequest = await mongoose.connection.collection('requests').findOne({
                            license_key: resolvedLicenseKey,
                            status: "PENDING"
                        });
                    }
                } catch (e) { console.log("Request fetch failed"); }

                return safeJson({
                    success: true,
                    identifier: resolvedLicenseKey || user.email || normalizedIdentifier,
                    license_key: user.license_key || null,
                    email: user.email || "No Email Linked",
                    reserved_email: user.reserved_email || "",
                    is_banned: user.is_banned || false,
                    is_paused: user.is_paused || false,
                    hwid: user.hwid || "NOT CAPTURED",
                    expiry: user.expiry_date,
                    games: user.games || [],
                    profile_pic: user.profile_pic || "",
                    pending_request: pendingRequest
                });

            case 'reset-hwid':
                try {
                    if (!resolvedLicenseKey) {
                        return res.json({ success: false, error: "Selected user has no license key on file" });
                    }

                    const requestsCollection = mongoose.connection.collection('requests');
                    const pendingReqList = await requestsCollection
                        .find({ license_key: resolvedLicenseKey, status: "PENDING" })
                        .sort({ date: -1 }).limit(1).toArray();

                    let responseMessage = "HWID reset.";
                    const userUpdate = { hwid: null };

                    if (pendingReqList.length > 0) {
                        const reqData = pendingReqList[0];

                        const now = new Date();
                        const newExpiry = new Date();
                        const days = user.duration_days || 30;

                        if (days >= 999) {
                            newExpiry.setFullYear(newExpiry.getFullYear() + 50); // Lifetime
                        } else {

                            const msToAdd = Math.floor(days * 24 * 60 * 60 * 1000);
                            newExpiry.setTime(now.getTime() + msToAdd);
                        }

                        userUpdate.expiry_date = newExpiry;
                        responseMessage = "Approved & Time Restored";

                        // Update Request Status
                        await requestsCollection.updateOne(
                            { _id: reqData._id },
                            { $set: { status: "APPROVED" } }
                        );

                        // DISCORD LOG: SHOW OLD VS NEW + RESTORED TIME
                        const DISCORD_WEBHOOK = "https://discord.com/api/webhooks/1375161068317573253/mK3ucW0iJcN9nj96LJ1L_0bSeCtx-dQMedS9kxvdz49Qhpsd1GCfWb3fRydp_b1Z1OT_";
                        const maskedKey = resolvedLicenseKey.substring(0, 5) + "****-****";

                        await fetch(DISCORD_WEBHOOK, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                username: "SK SECURITY SYSTEM",
                                embeds: [{
                                    title: "✅ HWID RESET & TIME RESTORED",
                                    description: `Admin has approved the reset and **restored the subscription timer** to its original duration.`,
                                    color: 0x00FF88,
                                    fields: [
                                        { name: "🔑 License", value: `\`${maskedKey}\``, inline: true },
                                        { name: "⏳ New Expiry", value: `<t:${Math.floor(newExpiry.getTime() / 1000)}:f>`, inline: true },
                                        { name: "🔴 Old HWID", value: `\`\`\`${reqData.old_hwid || "None"}\`\`\``, inline: false },
                                        { name: "🟢 New HWID (Target)", value: `\`\`\`${reqData.new_hwid || "None"}\`\`\``, inline: false }
                                    ],
                                    footer: { text: "SK Audit: Full time credit applied." },
                                    timestamp: new Date().toISOString()
                                }]
                            })
                        });
                        console.log(`[✅] Approved & Time Restored for: ${resolvedLicenseKey}`);
                    }

                    const updateResult = await User.updateOne(
                        { _id: user._id },
                        { $set: userUpdate }
                    );

                    if (!updateResult.matchedCount) {
                        return res.json({ success: false, error: "User not found" });
                    }

                    return res.json({
                        success: true,
                        message: responseMessage,
                        hwid: null,
                        expiry: userUpdate.expiry_date || user.expiry_date || null
                    });
                } catch (err) {
                    console.error("Reset Error:", err);
                    return res.json({ success: false, error: "Database sync failed" });
                }

            case 'deny-hwid':
                try {
                    if (!resolvedLicenseKey) {
                        return res.json({ success: false, error: "Selected user has no license key on file" });
                    }

                    const latestDeny = await mongoose.connection.collection('requests')
                        .find({ license_key: resolvedLicenseKey, status: "PENDING" })
                        .sort({ date: -1 })
                        .limit(1)
                        .toArray();

                    if (latestDeny.length > 0) {
                        await mongoose.connection.collection('requests').updateOne(
                            { _id: latestDeny[0]._id },
                            { $set: { status: "DENIED" } }
                        );

                        // --- DISCORD LOG: DENIED ---
                        const maskedKeyDeny = resolvedLicenseKey.substring(0, 5) + "****-****";
                        await fetch("https://discord.com_", {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                embeds: [{
                                    title: "❌ HWID RESET DENIED",
                                    description: `The request for key \`${maskedKeyDeny}\` has been **Rejected**.`,
                                    color: 0xFF4444, // Red
                                    footer: { text: "SK Security Audit Log" },
                                    timestamp: new Date().toISOString()
                                }]
                            })
                        });

                        console.log(`[❌] ADMIN PANEL: Denied Request for ${resolvedLicenseKey}`);
                    }
                    return res.json({ success: true, message: "Denied" });
                } catch (err) {
                    return res.json({ success: false, error: "Deny failed" });
                }

            case 'pause':
                user.is_paused = true;
                await user.save();
                return safeJson({ success: true, message: "Key paused." });

            case 'unpause':
                user.is_paused = false;
                await user.save();
                return safeJson({ success: true, message: "Key unpaused." });

            case 'ban':
                user.is_banned = true;
                await user.save();
                return safeJson({ success: true, message: "User banned." });

            case 'unban':
                user.is_banned = false;
                await user.save();
                return safeJson({ success: true, message: "User unbanned." });

            case 'delete':
                if (user?._id) {
                    await User.deleteOne({ _id: user._id });
                    return safeJson({ success: true, message: "Key deleted." });
                }
                if (normalizedIdentifier) {
                    const deleteFilter = normalizedIdentifier.includes("@")
                        ? { email: normalizedIdentifier.toLowerCase() }
                        : { license_key: normalizedIdentifier.toUpperCase() };
                    await User.deleteOne(deleteFilter);
                    return safeJson({ success: true, message: "Key deleted." });
                }
                return safeJson({ success: false, error: "No key provided to delete" });

            default:
                console.log(`[ADMIN] Unknown clean action: ${cleanAction}`);
                return safeJson({ success: false, error: `Invalid Action: ${cleanAction}` });
        }
    } catch (err) {
        console.error("Admin Route Error:", err);
        return res.status(500).json({ success: false, error: "Internal Server Error" });
    }
});

// --- USER REGISTER ---
app.post('/register', async (req, res) => {
    try {
        const { email, password, hwid } = req.body;

        if (!email || !password) {
            return res.json({ error: "Missing required fields" });
        }

        const cleanEmail = email.toLowerCase().trim();
        const cleanPass = password.trim();

        const emailCheck = await validateEmailAddress(cleanEmail);
        if (!emailCheck.valid) {
            return res.json({
                error: "invalid_email",
                message: getEmailValidationMessage(emailCheck.reason)
            });
        }

        // Check if account already exists
        const existingUser = await User.findOne({ email: cleanEmail });

        if (existingUser) {
            if (existingUser.password) {
                return res.json({ error: "Email already registered." });
            }

            existingUser.password = cleanPass;
            if (!existingUser.hwid && hwid) {
                existingUser.hwid = hwid;
            }
            await existingUser.save();

            console.log(`[REGISTER] Completed pre-registered user: ${cleanEmail}`);

            return res.json({
                status: "Success",
                message: "Account setup completed successfully."
            });
        }

        // Create new user
        const newUser = new User({
            email: cleanEmail,
            password: cleanPass,
            hwid: hwid || null,
            games: [],
            expiry_date: null
        });

        await newUser.save();

        console.log(`[REGISTER] New user created: ${cleanEmail}`);

        res.json({
            status: "Success",
            message: "Account created successfully."
        });

    } catch (err) {
        console.error("Register Error:", err);
        res.status(500).json({ error: "Internal Server Error" });
    }
});


// --- USER LOGIN ---
app.post('/login', async (req, res) => {
    try {
        const { email, password, hwid } = req.body;

        if (!email || !password) {
            return res.json({ error: "Missing required fields (Email/Password)" });
        }

        const cleanEmail = email.toLowerCase().trim();
        const cleanPass = password.trim();

        // 1. Get raw data (.lean()) - No casting crashes here
        let userData = await User.findOne({ email: cleanEmail }).lean();

        if (!userData) {
            return res.json({ error: "User not found. Please register first." });
        }

        // 2. Fix the dates on the plain object
        const fixDate = (d) => (d && d.$date) ? new Date(d.$date) : d;
        userData.expiry_date = fixDate(userData.expiry_date);
        userData.createdAt = fixDate(userData.createdAt);
        userData.updatedAt = fixDate(userData.updatedAt);

        // 3. Verify Password on the plain object
        if (!userData.password) {
            return res.json({ error: "Account setup incomplete. Please finish registration first." });
        }

        if (userData.password !== cleanPass) {
            return res.json({ error: "Invalid Email or Password." });
        }

        if (userData.is_banned) return res.json({ error: "Account Banned" });
        if (userData.is_paused) return res.json({ error: "Subscription Paused" });

        // 4. Update data directly in DB using findOneAndUpdate (STOPS E11000 ERRORS)
        let updates = {};

        // Activation Logic
        if (!userData.expiry_date) {
            const days = (typeof userData.duration_days === 'number') ? userData.duration_days : 30;
            const expiry = new Date();
            if (days >= 999) {
                expiry.setFullYear(expiry.getFullYear() + 50);
            } else {
                expiry.setTime(expiry.getTime() + (days * 24 * 60 * 60 * 1000));
            }
            updates.expiry_date = expiry;
            userData.expiry_date = expiry; // Update local copy for response
        }

        // HWID Logic
        if (!userData.hwid) {
            updates.hwid = hwid;
        } else if (userData.hwid !== hwid) {
            return res.json({ error: "HWID Mismatch. Please request a reset." });
        }

        // If there are changes, save them to the DB without a "new User" collision
        if (Object.keys(updates).length > 0) {
            await User.findOneAndUpdate({ _id: userData._id }, { $set: updates });
        }

        // 5. Expiry Check
        if (new Date() > new Date(userData.expiry_date)) {
            return res.json({ error: "Subscription Expired" });
        }

        res.json({
            token: "VALID",
            expiry: userData.expiry_date,
            profile_pic: userData.profile_pic || '',
            games: userData.games || [],
            license_key: userData.license_key
        });

    } catch (err) {
        console.error("Login Crash:", err);
        res.status(500).json({ error: "Internal Server Error", message: err.message });
    }
});

app.post('/update-profile', async (req, res) => {
    try {
        const { user_id_email, new_license_key, email, password, profile_pic } = req.body;

        // Find user by email (the reliable session ID)
        const user = await User.findOne({ email: user_id_email });

        if (!user) {
            return res.status(404).json({ success: false, error: "User not found" });
        }

        // 1. If they provided a new license key, update it
        if (new_license_key) {
            user.license_key = new_license_key;
        }

        // 2. Update Profile Pic if sent
        if (profile_pic) user.profile_pic = profile_pic;

        // 3. Update Password if sent
        if (password) user.password = password;

        // 4. Update Email display if changed
        if (email) {
            const cleanEmail = email.toLowerCase().trim();
            if (cleanEmail !== user.email) {
                const emailCheck = await validateEmailAddress(cleanEmail);
                if (!emailCheck.valid) {
                    return res.status(400).json({
                        success: false,
                        error: getEmailValidationMessage(emailCheck.reason),
                        code: 'invalid_email'
                    });
                }
            }

            user.email = cleanEmail;
        }

        await user.save();

        res.json({
            success: true,
            message: "Profile updated!",
            profile_pic: user.profile_pic || ""
        });

    } catch (err) {
        console.error("Update Error:", err);
        res.status(500).json({ success: false, error: "Internal Server Error" });
    }
});


// --- LOADER STATUS CHECK ---
app.get('/check-reset-status', async (req, res) => {
    try {
        const { key } = req.query;
        if (!key) return res.json({ status: "NONE" });

        const requestsCollection = mongoose.connection.collection('requests');

        // Find the LATEST entry in the 'requests' collection for this key
        const request = await requestsCollection
            .find({ license_key: key.toUpperCase() })
            .sort({ date: -1 })
            .limit(1)
            .toArray();

        if (request.length === 0) {
            return res.json({ status: "NONE" });
        }

        const ticketNumber = await ensureHwidTicketNumber(requestsCollection, request[0]);

        // Return only the status (PENDING, APPROVED, or DENIED)
        res.json({
            status: request[0].status,
            requestId: String(request[0]._id),
            ticketNumber,
            date: request[0].date || null
        });
    } catch (err) {
        console.error("Polling Error:", err);
        res.status(500).json({ status: "ERROR" });
    }
});


app.post('/request-hwid-reset', async (req, res) => {
    try {
        const { hwid, license_key, type } = req.body;

        if (!hwid || !license_key || type !== "ADMIN-PANEL_RESET") {
            return res.status(400).json({ success: false, error: "Invalid Request Format" });
        }

        const upperKey = license_key.toUpperCase();
        const requestsCollection = mongoose.connection.collection('requests');

        const existingPending = await requestsCollection.find({
            license_key: upperKey,
            status: "PENDING"
        })
            .sort({ date: -1 })
            .limit(1)
            .toArray();

        if (existingPending.length > 0) {
            const ticketNumber = await ensureHwidTicketNumber(requestsCollection, existingPending[0]);
            return res.json({
                success: true,
                message: "Request already pending.",
                status: "PENDING",
                requestId: String(existingPending[0]._id),
                ticketNumber,
                date: existingPending[0].date || null
            });
        }

        const user = await User.findOne({ license_key: upperKey });
        const oldHwid = user ? user.hwid : "NOT_SET";

        // --- MASKING LOGIC ---
        const maskedKey = upperKey.substring(0, 5) + "****-****";
        const maskedHWID = hwid.substring(0, 4) + "********" + hwid.slice(-4);

        // --- 1. SAVE TO DATABASE ---
        const requestDate = new Date();
        const ticketNumber = await getNextHwidTicketNumber();
        const insertResult = await requestsCollection.insertOne({
            old_hwid: oldHwid,
            new_hwid: hwid,
            license_key: upperKey,
            type: type,
            status: "PENDING",
            ticket_number: ticketNumber,
            date: requestDate
        });

        // --- 2. SEND TO DISCORD ---
        const DISCORD_WEBHOOK = "https://discord.com/api/webhooks/1375161068317573253/mK3ucW0iJcN9nj96LJ1L_0bSeCtx-dQMedS9kxvdz49Qhpsd1GCfWb3fRydp_b1Z1OT_";
        await fetch(DISCORD_WEBHOOK, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                content: "⚠️ **NEW RESET REQUEST** <@&1370451599427764234>",
                embeds: [{
                    title: "🔒 HWID RESET PENDING",
                    color: 0xFFCC00,
                    fields: [
                        { name: "🔑 License", value: `\`${maskedKey}\``, inline: true },
                        { name: "🕒 Time", value: `<t:${Math.floor(Date.now() / 1000)}:R>`, inline: true },
                        { name: "🖥️ Current (Old) HWID", value: `\`\`\`${oldHwid || "None"}\`\`\``, inline: false }
                    ],
                    footer: { text: "Details visible in Admin Panel" }
                }]
            })
        });

        return res.json({
            success: true,
            message: "Admin notified.",
            status: "PENDING",
            requestId: String(insertResult.insertedId),
            ticketNumber,
            date: requestDate
        });
    } catch (err) {
        res.status(500).json({ success: false, error: "Internal Error" });
    }
});

app.post('/admin/add-time', async (req, res) => {
    const { license_key, admin_password, days } = req.body;
    if (admin_password !== process.env.ADMIN_SECRET) return res.status(403).json({ error: "Invalid Admin Pass" });

    try {
        const user = await User.findOne({ license_key: license_key.toUpperCase() });
        if (!user) return res.status(404).json({ error: "User not found" });

        const daysToAdd = parseFloat(days);
        const currentExpiry = user.expiry_date ? new Date(user.expiry_date) : new Date();

        // If expired, start from NOW. If active, add to existing time.
        const baseDate = (currentExpiry > new Date()) ? currentExpiry : new Date();
        const newExpiry = applyDuration(baseDate, daysToAdd);

        user.expiry_date = newExpiry;
        await user.save();

        res.json({ success: true, new_expiry: user.expiry_date });
    } catch (err) {
        res.status(500).json({ error: "Server Error" });
    }
});

// --- USER: REDEEM VOUCHER KEY ---
app.post('/redeem', async (req, res) => {
    try {
        const { email, license_key, hwid } = req.body;

        if (!email || !license_key) {
            return res.status(400).json({ status: "Error", error: "Missing email or key." });
        }

        // 1. Find the Voucher Key (A key that exists in DB but has no real email yet)
        const voucher = await User.findOne({
            license_key: license_key.toUpperCase().trim(),
            email: { $regex: /pending_/i } // Checks for your "pending_..." prefix logic
        });

        if (!voucher) {
            return res.status(404).json({
                status: "Error",
                error: "Invalid or already used license key."
            });
        }

        // 2. Find the Active User account
        const user = await User.findOne({ email: email.toLowerCase().trim() });
        if (!user) {
            return res.status(404).json({ status: "Error", error: "Account not found." });
        }

        const daysToAdd = parseFloat(voucher.duration_days) || 30;
        const redeemedLicenseKey = voucher.license_key ? voucher.license_key.toUpperCase().trim() : null;

        // 4. Update Expiry: If expired, start from now. If active, add to existing.
        let currentExpiry = user.expiry_date ? new Date(user.expiry_date) : new Date();
        const baseDate = (currentExpiry > new Date()) ? currentExpiry : new Date();

        user.expiry_date = applyDuration(baseDate, daysToAdd);

        // 5. Update Games: Merge games from the voucher into the user account
        if (voucher.games && Array.isArray(voucher.games)) {
            const updatedGames = new Set([...user.games, ...voucher.games]);
            user.games = Array.from(updatedGames);
        }

        // 6. Nuke the Voucher (So it can't be used again)
        await User.deleteOne({ _id: voucher._id });

        // 7. Save the active user
        if (redeemedLicenseKey) {
            user.license_key = redeemedLicenseKey;
        }
        await user.save();

        console.log(`[REDEEM] ${email} redeemed ${daysToAdd} days via ${license_key}`);
        void sendRedeemDiscordLog({
            email: email.toLowerCase().trim(),
            hwid,
            user,
            voucher,
            daysToAdd,
            sourceKey: license_key
        }).catch((error) => {
            console.error("[REDEEM LOG ERROR]", error);
        });

        res.json({
            status: "Success",
            message: `Successfully added ${daysToAdd} days!`,
            new_expiry: user.expiry_date,
            license_key: user.license_key
        });

    } catch (err) {
        console.error("[REDEEM ERROR]", err);
        res.status(500).json({ status: "Error", error: "Internal server error." });
    }
});


app.get('/health', (req, res) => {
    res.json({
        status: "online",
        database: mongoose.connection.readyState === 1 ? "connected" : "disconnected"
    });
});

app.get('/loader-notification/latest', async (req, res) => {
    try {
        const payload = await fetchLatestLoaderAnnouncement();
        res.json(payload);
    } catch (error) {
        console.error("[DISCORD ANNOUNCEMENT ERROR]", error);
        res.status(500).json({
            enabled: false,
            error: "discord_announcement_unavailable"
        });
    }
});

app.get('/discord-health', (req, res) => {
    try {
        res.json(getDiscordBotStatus());
    } catch (error) {
        console.error('[DISCORD BOT] Health route failed:', error);
        res.status(500).json({ error: 'discord_health_failed' });
    }
});

app.get('/', (req, res) => res.send('API Online & Connected.'));

const PORT = process.env.PORT || 10000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 API Active on port ${PORT}`);
});

initDiscordBot({ User, mongoose });
