require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const crypto = require('crypto');
const cors = require('cors');

// --- 1. HANDLE MODELS SAFELY ---
if (mongoose.models.User) delete mongoose.models.User;

const bcrypt = require('bcryptjs');
const User = require('../src/user');

const app = express();

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
        const { days, games } = req.body;
        const daysNum = parseFloat(days) || 30;

        const gamePrefixMap = {
            "CS2": "CS2X",
            "FiveM": "FIVM",
            "GTAV": "GTAV",
            "Warzone": "WARZ",
            "All-Access": "ALLX"
        };

        // Generate the Key with the correct Prefix
        const firstGame = Array.isArray(games) ? games[0] : games;
        const prefix = gamePrefixMap[firstGame] || "GENR";

        // Generates a clean key like: CS2X-ABCD-1234
        const randomPart = crypto.randomBytes(4).toString('hex').toUpperCase();
        const randomPart2 = crypto.randomBytes(4).toString('hex').toUpperCase();
        const newKey = `${prefix}-${randomPart}-${randomPart2}`;

        // Create the VOUCHER Document
        const userData = {
            license_key: newKey,
            duration_days: daysNum,
            games: Array.isArray(games) ? games : [games],
            email: `pending_${newKey.toLowerCase()}@vouchers.internal`,
            password: "VOUCHER_PROTECTED", // Placeholder
            hwid: null,
            expiry_date: null,
            is_banned: false
        };

        const newUser = new User(userData);
        await newUser.save();

        console.log(`[ADMIN] Key Created: ${newKey} (${daysNum} days)`);

        res.json({
            success: true,
            key: newKey,
            message: "Voucher saved. User must register normally and redeem this key."
        });

    } catch (err) {
        console.error("Create Key Error:", err);
        res.status(500).json({ success: false, error: "Database conflict or error." });
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
                    const oldHwid = user.hwid || "NOT_SET";
                    // Always clear the key's HWID lock so next login (e.g. after spoof) can bind the new HWID
                    user.hwid = null;
                    await user.save();
                    console.log(`[✅] HWID lock cleared for key: ${license_key} (old HWID: ${oldHwid})`);

                    // If there was a pending request, also approve it and restore time
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

                        user.expiry_date = newExpiry;
                        await user.save();

                        await mongoose.connection.collection('requests').updateOne(
                            { _id: reqData._id },
                            { $set: { status: "APPROVED" } }
                        );

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
                        return res.json({ success: true, message: "HWID lock cleared & time restored." });
                    }

                    return res.json({ success: true, message: "HWID lock cleared. Next login will bind the new HWID." });
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

// -- USER REGISTRATION --
app.post('/register', async (req, res) => {
    try {
        const { email, password, hwid } = req.body;

        if (!email || !password) {
            return res.json({ status: "Error", error: "Missing Email or Password" });
        }

        const cleanEmail = email.toLowerCase().trim();

        // --- 1. STRICT EMAIL DOMAIN FILTER ---
        const allowedDomains = /@(gmail|yahoo|outlook|icloud|hotmail|live|me)\.(com|net|org)$/;
        if (!allowedDomains.test(cleanEmail)) {
            return res.json({
                status: "Error",
                error: "Please use a valid provider (Gmail, Yahoo, Outlook, or iCloud)."
            });
        }

        // 2. Check existence
        const existingUser = await User.findOne({ email: cleanEmail });
        if (existingUser) {
            return res.json({ status: "Error", error: "Email already in use." });
        }

        // 3. SECURE HASHING
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password.trim(), salt);

        // 4. CREATE USER (Completely Clean State)
        const newUser = new User({
            email: cleanEmail,
            password: hashedPassword,
            hwid: hwid || null,
            expiry_date: null, // No subscription time yet
            license_key: null  // FIXED: No "PENDING_ACTIVATION" filler
        });

        await newUser.save();

        // --- 5. SUCCESS RESPONSE WITH PROMPT ---
        res.json({
            status: "Success",
            message: "Account Created! Log in and click your PROFILE ICON to redeem your subscription key."
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
            return res.json({ error: "Missing Email or Password" });
        }

        const cleanEmail = email.toLowerCase().trim();
        const cleanPass = password.trim();

        // 1. Find user by email
        const user = await User.findOne({ email: cleanEmail });

        if (!user) {
            return res.json({ error: "Account not found. Please register first." });
        }

        // 2. Verify Hashed Password
        // This replaces the old (user.password !== cleanPass) check
        const isMatch = await bcrypt.compare(cleanPass, user.password);
        if (!isMatch) {
            return res.json({ error: "Invalid Email or Password." });
        }

        // 3. Status Checks
        if (user.is_banned) return res.json({ error: "Account Banned" });
        if (user.is_paused) return res.json({ error: "Subscription Paused" });

        // 4. Activation Logic (Initialize expiry if missing)
        if (!user.expiry_date) {
            const days = (typeof user.duration_days === 'number') ? user.duration_days : 0.0416;
            const expiry = new Date();
            if (days >= 999) {
                expiry.setFullYear(expiry.getFullYear() + 50);
            } else {
                expiry.setTime(expiry.getTime() + (days * 24 * 60 * 60 * 1000));
            }
            user.expiry_date = expiry;
            await user.save();
        }

        // 5. Expiry Check
        if (new Date() > new Date(user.expiry_date)) {
            return res.json({ error: "Subscription Expired" });
        }

        // 6. HWID Logic
        if (!user.hwid) {
            // First time login - link the HWID
            user.hwid = hwid;
            await user.save();
        } else if (user.hwid !== hwid) {
            // HWID doesn't match the one on file
            return res.json({ error: "HWID Mismatch. Please request a reset." });
        }

        // 7. Success Response
        res.json({
            token: "VALID",
            expiry: user.expiry_date,
            profile_pic: user.profile_pic || '',
            games: user.games || [],
            license_key: user.license_key
        });

    } catch (err) {
        console.error("Login Crash:", err);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

// --- UPDATE PROFILE ROUTE ---
app.post('/update-profile', async (req, res) => {
    try {
        const { license_key, email, password, profile_pic } = req.body;

        // Find the user by their key
        const user = await User.findOne({ license_key: license_key.toUpperCase() });

        if (!user) {
            return res.status(404).json({ success: false, error: "User not found" });
        }

        // Update fields only if they were sent
        if (email) user.email = email.toLowerCase();
        if (password) user.password = password;
        if (profile_pic) user.profile_pic = profile_pic;

        await user.save();

        console.log(`[UPDATED] Profile for key: ${license_key}`);
        res.json({ success: true, message: "Profile updated successfully!" });

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
        const { email, license_key } = req.body;

        if (!email || !license_key) {
            return res.json({ status: "Error", error: "Missing email or key." });
        }

        const cleanKey = license_key.toUpperCase().trim();
        const cleanEmail = email.toLowerCase().trim();

        // 1. Find the Voucher (The unassigned key in your DB)
        // This looks for a record that HAS the key but IS NOT yet tied to a real user email
        const voucher = await User.findOne({
            license_key: cleanKey,
            $or: [
                { email: { $regex: /pending_/i } }, // Your current prefix logic
                { email: null }                     // Extra safety for blank keys
            ]
        });

        if (!voucher) {
            return res.json({
                status: "Error",
                error: "Invalid, expired, or already used license key."
            });
        }

        // 2. Find the logged-in User account
        const user = await User.findOne({ email: cleanEmail });
        if (!user) {
            return res.json({ status: "Error", error: "Account not found." });
        }

        // 3. Calculate Time to Add
        const daysToAdd = parseFloat(voucher.duration_days) || 30;

        // Use existing expiry if it's in the future; otherwise, start from right now
        let baseDate = (user.expiry_date && new Date(user.expiry_date) > new Date())
            ? new Date(user.expiry_date)
            : new Date();

        baseDate.setDate(baseDate.getDate() + daysToAdd);
        user.expiry_date = baseDate;

        // 4. Update Games (Merge the voucher's games into the user's list)
        if (voucher.games && Array.isArray(voucher.games)) {
            const updatedGames = new Set([...(user.games || []), ...voucher.games]);
            user.games = Array.from(updatedGames);
        }

        // 5. Update the User's License Key field
        // This replaces 'null' with the actual key they just used
        user.license_key = cleanKey;

        // 6. Delete the Voucher record so it can't be reused
        await User.deleteOne({ _id: voucher._id });

        // 7. Save the active user
        await user.save();

        console.log(`[REDEEM] ${cleanEmail} activated ${daysToAdd} days via ${cleanKey}`);

        res.json({
            status: "Success",
            message: `Success! Added ${daysToAdd} days to your account.`,
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

app.get('/', (req, res) => res.send('API Online & Connected.'));

const PORT = process.env.PORT || 10000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 API Active on port ${PORT}`);
});
