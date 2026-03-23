require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const crypto = require('crypto');
const bcrypt = require("bcryptjs");
const cors = require('cors');

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

const app = express();

app.use(express.json());

// --- 2. MIDDLEWARE ---
app.use(express.json({ limit: '75mb' }));
app.use(express.urlencoded({ limit: '75mb', extended: true }));
app.use(cors());

// --- 3. DATABASE CONNECTION ---
mongoose.connect(process.env.MONGO_URL) // <- remove old options
    .then(() => console.log('✅ MongoDB Connected'))
    .catch(err => console.error('❌ MongoDB Connection Error:', err));

// --- 1. ADMIN MIDDLEWARE ---
function verifyAdmin(req, res, next) {
    const { admin_password } = req.body;
    if (!admin_password || admin_password !== process.env.ADMIN_SECRET) {
        return res.status(401).json({ success: false, error: "Unauthorized" });
    }
    next();
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

const DISCORD_LOADER_ALERT_CHANNEL_ID = process.env.DISCORD_LOADER_ALERT_CHANNEL_ID || "1373760247658971256";

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
    const botToken = process.env.DISCORD_BOT_TOKEN;

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

        if (cleanAction === 'add-time') {
            // Pull 'days' from req.body
            const daysToAdd = parseFloat(req.body.days);

            if (isNaN(daysToAdd)) {
                return res.status(400).json({ success: false, error: "Invalid days value" });
            }

            // Math: If expired, start from NOW. If active, add to existing
            let currentExpiry = user.expiry_date ? new Date(user.expiry_date) : new Date();
            const baseDate = (currentExpiry > new Date()) ? currentExpiry : new Date();
            const newExpiry = applyDuration(baseDate, daysToAdd);

            user.expiry_date = newExpiry;
            await user.save();

            console.log(`[ADMIN] Successfully added ${daysToAdd} days to: ${resolvedLicenseKey || normalizedIdentifier}`);
            return res.json({
                success: true,
                message: daysToAdd >= 999
                    ? `Set lifetime expiry: ${newExpiry.toLocaleDateString()}`
                    : `Added ${daysToAdd} days. New Expiry: ${newExpiry.toLocaleDateString()}`
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
        if (email) user.email = email.toLowerCase();

        await user.save();

        res.json({ success: true, message: "Profile updated!" });

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

        // Find the LATEST entry in the 'requests' collection for this key
        const request = await mongoose.connection.collection('requests')
            .find({ license_key: key.toUpperCase() })
            .sort({ date: -1 })
            .limit(1)
            .toArray();

        if (request.length === 0) {
            return res.json({ status: "NONE" });
        }

        // Return only the status (PENDING, APPROVED, or DENIED)
        res.json({
            status: request[0].status,
            requestId: String(request[0]._id),
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
            return res.json({
                success: true,
                message: "Request already pending.",
                status: "PENDING",
                requestId: String(existingPending[0]._id),
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
        const insertResult = await requestsCollection.insertOne({
            old_hwid: oldHwid,
            new_hwid: hwid,
            license_key: upperKey,
            type: type,
            status: "PENDING",
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
        const payload = await fetchLatestDiscordAnnouncement();
        res.json(payload);
    } catch (error) {
        console.error("[DISCORD ANNOUNCEMENT ERROR]", error);
        res.status(500).json({
            enabled: false,
            error: "discord_announcement_unavailable"
        });
    }
});

app.get('/', (req, res) => res.send('API Online & Connected.'));

const PORT = process.env.PORT || 10000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 API Active on port ${PORT}`);
});
