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
                        license_key: k.license_key,
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

        const identifier = req.body.identifier || license_key;

        if (identifier) {
            const clean = identifier.trim();

            if (clean.includes("@")) {
                // Lookup by email
                user = await User.findOne({ email: clean.toLowerCase() });
            } else {
                // Lookup by license key
                user = await User.findOne({ license_key: clean.toUpperCase() });
            }
        }

        if (!user && cleanAction !== 'delete') {
            console.log(`[ADMIN] Error: Key not found for action "${cleanAction}"`);
            return safeJson({ success: false, error: "Key not found" });
        }

        if (cleanAction === 'add-time') {
            // Pull 'days' from req.body
            const daysToAdd = parseFloat(req.body.days);

            if (isNaN(daysToAdd)) {
                return res.status(400).json({ success: false, error: "Invalid days value" });
            }

            // Math: If expired, start from NOW. If active, add to existing
            let currentExpiry = user.expiry_date ? new Date(user.expiry_date) : new Date();
            let baseDate = (currentExpiry > new Date()) ? currentExpiry : new Date();

            // Add the days
            baseDate.setDate(baseDate.getDate() + daysToAdd);

            user.expiry_date = baseDate;
            await user.save();

            console.log(`[ADMIN] Successfully added ${daysToAdd} days to: ${license_key}`);
            return res.json({
                success: true,
                message: `Added ${daysToAdd} days. New Expiry: ${baseDate.toLocaleDateString()}`
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

                        const now = new Date();
                        const newExpiry = new Date();
                        const days = user.duration_days || 30;

                        if (days >= 999) {
                            newExpiry.setFullYear(newExpiry.getFullYear() + 50); // Lifetime
                        } else {

                            const msToAdd = Math.floor(days * 24 * 60 * 60 * 1000);
                            newExpiry.setTime(now.getTime() + msToAdd);
                        }

                        // Update User
                        user.hwid = null;
                        user.expiry_date = newExpiry;
                        await user.save();

                        // Update Request Status
                        await mongoose.connection.collection('requests').updateOne(
                            { _id: reqData._id },
                            { $set: { status: "APPROVED" } }
                        );

                        // DISCORD LOG: SHOW OLD VS NEW + RESTORED TIME
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
            return res.json({ error: "Email already registered." });
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

app.post('/admin/add-time', async (req, res) => {
    const { license_key, admin_password, days } = req.body;
    if (admin_password !== process.env.ADMIN_PASS) return res.status(403).json({ error: "Invalid Admin Pass" });

    try {
        const user = await User.findOne({ license_key: license_key.toUpperCase() });
        if (!user) return res.status(404).json({ error: "User not found" });

        const daysToAdd = parseFloat(days);
        const currentExpiry = new Date(user.expiry_date);

        // If expired, start from NOW. If active, add to existing time.
        const baseDate = (currentExpiry > new Date()) ? currentExpiry : new Date();
        baseDate.setDate(baseDate.getDate() + daysToAdd);

        user.expiry_date = baseDate;
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

        // 4. Update Expiry: If expired, start from now. If active, add to existing.
        let currentExpiry = user.expiry_date ? new Date(user.expiry_date) : new Date();
        let baseDate = (currentExpiry > new Date()) ? currentExpiry : new Date();

        baseDate.setDate(baseDate.getDate() + daysToAdd);
        user.expiry_date = baseDate;

        // 5. Update Games: Merge games from the voucher into the user account
        if (voucher.games && Array.isArray(voucher.games)) {
            const updatedGames = new Set([...user.games, ...voucher.games]);
            user.games = Array.from(updatedGames);
        }

        // 6. Nuke the Voucher (So it can't be used again)
        await User.deleteOne({ _id: voucher._id });

        // 7. Save the active user
        await user.save();

        console.log(`[REDEEM] ${email} redeemed ${daysToAdd} days via ${license_key}`);

        res.json({
            status: "Success",
            message: `Successfully added ${daysToAdd} days!`,
            new_expiry: user.expiry_date
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

app.get('/', (req, res) => res.send('API Online & Connected.'));

const PORT = process.env.PORT || 10000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 API Active on port ${PORT}`);
});
