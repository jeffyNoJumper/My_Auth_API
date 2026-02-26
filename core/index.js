require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const crypto = require('crypto');
const cors = require('cors');

// --- 1. HANDLE MODELS SAFELY ---
if (mongoose.models.User) delete mongoose.models.User;

const User = require('./src/user');

const app = express();

app.get('/ping', (req, res) => {
    res.status(200).send('Server is awake!');
});

// --- 2. MIDDLEWARE ---
app.use(express.json({ limit: '75mb' }));
app.use(express.urlencoded({ limit: '75mb', extended: true }));
app.use(cors());

// --- 3. DATABASE CONNECTION & NUKE ---
mongoose.connect(process.env.MONGO_URL)
    .then(async () => {
        console.log("✅ Connected to MongoDB");

        try {
            const db = mongoose.connection.db;

            await db.command({
                collMod: "users",
                validator: {},
                validationLevel: "off"
            });

            await mongoose.connection.collection('users').dropIndex("expiry_date_1").catch(() => { });

            await User.syncIndexes();

            console.log("🔥 DATABASE RESTRAINTS NUKE SUCCESS");
        } catch (err) {
            console.log("ℹ️ Database is clean.");
        }
    }).catch(err => console.error("❌ Connection Error:", err));

const Request = mongoose.models.Request || mongoose.model('Request', new mongoose.Schema({
    hwid: String,
    license_key: String,
    type: String,
    status: { type: String, default: "PENDING" },
    date: { type: Date, default: Date.now }
}));

// --- 1. ADMIN MIDDLEWARE ---
function verifyAdmin(req, res, next) {
    const { admin_password } = req.body;
    if (!admin_password || admin_password !== process.env.ADMIN_SECRET) {
        return res.status(401).json({ success: false, error: "Unauthorized" });
    }
    next();
}

// --- 2. CREATE KEY ---
app.post('/admin/create-key', verifyAdmin, async (req, res) => {
    try {
        const { days, games, email, password } = req.body;
        const daysNum = parseFloat(days);

        const gamePrefixMap = {
            "CS2": "CS2X",
            "FiveM": "FIVM",
            "GTAV": "GTAV",
            "Warzone": "WARZ",
            "All-Access": "ALLX"
        };

        const firstGame = Array.isArray(games) ? games[0] : games;

        const prefix = gamePrefixMap[firstGame] || "GENR";

        const randomPart = crypto.randomBytes(6).toString('hex').toUpperCase().match(/.{4}/g).join('-');
        const newKey = `${prefix}-${randomPart}`;

        const userData = {
            license_key: newKey,
            duration_days: daysNum,
            games: Array.isArray(games) ? games : [games],
            email: email ? email.toLowerCase() : `pending_${randomPart}@auth.com`,
            password: password || null,
            hwid: null,
            expiry_date: null
        };

        const newUser = new User(userData);
        await newUser.save();

        res.json({
            success: true,
            key: newKey,
            expiry: null,
            games: newUser.games
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
                const keys = await User.find({}, 'license_key email expiry_date is_banned is_paused games').lean();
                return safeJson({
                    success: true,
                    keys: keys.map(k => ({
                        license_key: k.license_key || "N/A",
                        email: k.email || "No Email",
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
        if (license_key) {
            user = await User.findOne({ license_key: license_key.toUpperCase().trim() });
        }

        // 5. VALIDATE USER EXISTENCE
        // We only return "Key not found" if it's NOT a delete action
        if (!user && cleanAction !== 'delete') {
            console.log(`[ADMIN] Error: Key not found for action "${cleanAction}"`);
            return safeJson({ success: false, error: "Key not found" });
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
                    // Using raw connection to match the 'reset-hwid' collection exactly
                    pendingRequest = await mongoose.connection.collection('requests').findOne({
                        license_key: license_key.toUpperCase(),
                        status: "PENDING"
                    });
                } catch (e) { console.log("Request fetch failed"); }

                return safeJson({
                    success: true,
                    email: user.email || "No Email Linked",
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
                    // 1. Find the pending request to get the IDs
                    const pendingReqList = await mongoose.connection.collection('requests')
                        .find({ license_key: license_key.toUpperCase(), status: "PENDING" })
                        .sort({ date: -1 }).limit(1).toArray();

                    if (pendingReqList.length > 0) {
                        const reqData = pendingReqList[0];

                        // --- NEW: TIME RESTORE LOGIC ---
                        const now = new Date();
                        const newExpiry = new Date();
                        const days = user.duration_days || 30; // Fallback to 30 if missing

                        if (days >= 999) {
                            newExpiry.setFullYear(newExpiry.getFullYear() + 50); // Lifetime
                        } else {
                            // Reset to full original duration starting NOW
                            const msToAdd = Math.floor(days * 24 * 60 * 60 * 1000);
                            newExpiry.setTime(now.getTime() + msToAdd);
                        }

                        // 2. Update User
                        user.hwid = null;
                        user.expiry_date = newExpiry;
                        await user.save();

                        // 3. Update Request Status
                        await mongoose.connection.collection('requests').updateOne(
                            { _id: reqData._id },
                            { $set: { status: "APPROVED" } }
                        );

                        // 4. DISCORD LOG: SHOW OLD VS NEW + RESTORED TIME
                        const DISCORD_WEBHOOK = "https://discord.com/api/webhooks/1375161068317573253/mK3ucW0iJcN9nj96LJ1L_0bSeCtx-dQMedS9kxvdz49Qhpsd1GCfWb3fRydp_b1Z1OT_";
                        const maskedKey = license_key.substring(0, 5) + "****-****";

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
                        console.log(`[✅] Approved & Time Restored for: ${license_key}`);
                    }
                    return res.json({ success: true, message: "Approved & Time Restored" });
                } catch (err) {
                    console.error("Reset Error:", err);
                    return res.json({ success: false, error: "Database sync failed" });
                }

            case 'deny-hwid':
                try {
                    const latestDeny = await mongoose.connection.collection('requests')
                        .find({ license_key: license_key.toUpperCase(), status: "PENDING" })
                        .sort({ date: -1 })
                        .limit(1)
                        .toArray();

                    if (latestDeny.length > 0) {
                        await mongoose.connection.collection('requests').updateOne(
                            { _id: latestDeny[0]._id },
                            { $set: { status: "DENIED" } }
                        );

                        // --- DISCORD LOG: DENIED ---
                        const maskedKeyDeny = license_key.substring(0, 5) + "****-****";
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

                        console.log(`[❌] ADMIN PANEL: Denied Request for ${license_key}`);
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
                if (license_key) {
                    await User.deleteOne({ license_key: license_key.toUpperCase().trim() });
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

// --- USER LOGIN ---
app.post('/login', async (req, res) => {
    try {
        const { email, password, license_key, hwid } = req.body;

        if (!email || !password || !license_key) {
            return res.json({ error: "Missing required fields" });
        }

        const cleanEmail = email.toLowerCase().trim();
        const cleanKey = license_key.toUpperCase().trim();
        const cleanPass = password.trim();

        const user = await User.findOne({ license_key: cleanKey });

        if (!user) return res.json({ error: "Invalid License Key" });

        const isNewUser = !user.password || user.email.includes('pending_');

        if (isNewUser) {

            const emailCheck = await User.findOne({ email: cleanEmail });
            if (emailCheck && emailCheck.license_key !== cleanKey) {
                return res.json({ error: "This email is already registered to another key." });
            }

            user.email = cleanEmail;
            user.password = cleanPass;
            await user.save();
            console.log(`[AUTH] Key ${cleanKey} registered to: ${cleanEmail}`);
        }

        else {
            if (user.email !== cleanEmail || user.password !== cleanPass) {
                return res.json({ error: "Invalid Email or Password for this key." });
            }
        }

        if (user.is_banned) return res.json({ error: "Account Banned" });
        if (user.is_paused) return res.json({ error: "Subscription Paused" });

        // --- 5. ACTIVATION: Start the timer on first login ---
        if (!user.expiry_date || user.expiry_date === null) {
            const now = new Date();
            const expiry = new Date();

            const days = (typeof user.duration_days === 'number') ? user.duration_days : 0.0416;

            if (days >= 999) {
                expiry.setFullYear(expiry.getFullYear() + 50);
            } else {
                const msToAdd = Math.floor(days * 24 * 60 * 60 * 1000);
                expiry.setTime(now.getTime() + msToAdd);
            }

            user.expiry_date = expiry;
            await user.save();
            console.log(`[AUTH] Key ${cleanKey} activated for ${days} days (${Math.round(msToAdd / 60000)} minutes).`);
        }

        if (new Date() > user.expiry_date) return res.json({ error: "Subscription Expired" });

        if (!user.hwid || user.hwid === "null" || user.hwid === null) {
            user.hwid = hwid;
            await user.save();
        } else if (user.hwid !== hwid) {
            return res.json({ error: "HWID Mismatch. Please request a reset." });
        }

        res.json({
            token: "VALID",
            expiry: user.expiry_date,
            profile_pic: user.profile_pic || '',
            games: user.games || []
        });

    } catch (err) {
        console.error("Login Crash:", err);
        res.status(500).json({ error: "Internal Server Error" });
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
        res.json({ status: request[0].status });
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

        const user = await User.findOne({ license_key: upperKey });
        const oldHwid = user ? user.hwid : "NOT_SET";

        // --- MASKING LOGIC ---
        const maskedKey = upperKey.substring(0, 5) + "****-****";
        const maskedHWID = hwid.substring(0, 4) + "********" + hwid.slice(-4);

        // --- 1. SAVE TO DATABASE ---
        await mongoose.connection.collection('requests').insertOne({
            old_hwid: oldHwid,
            new_hwid: hwid,
            license_key: upperKey,
            type: type,
            status: "PENDING",
            date: new Date()
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

        return res.json({ success: true, message: "Admin notified." });
    } catch (err) {
        res.status(500).json({ success: false, error: "Internal Error" });
    }
});


app.get('/health', (req, res) => {
    res.json({
        status: "online",
        database: mongoose.connection.readyState === 1 ? "connected" : "disconnected"
    });
});

app.get('/', (req, res) => res.send('API Online & Connected.'));

const PORT = process.env.PORT || 8080;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 API Active on port ${PORT}`);
});
