require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const User = require('./user');
const crypto = require('crypto');
const cors = require('cors');


const app = express();

app.use(express.json({ limit: '75mb' }));
app.use(express.urlencoded({ limit: '75mb', extended: true }));

// Middleware
app.use(cors());

// MongoDB Connection (FORCE CLEAN VERSION)
mongoose.connect(process.env.MONGO_URL)
    .then(async () => {
        console.log("✅ Connected to MongoDB");

        try {
            const db = mongoose.connection.db;

            // 1. CLEAR HIDDEN SCHEMA VALIDATORS (The most common 500 error cause)
            await db.command({
                collMod: "users",
                validator: {},
                validationLevel: "off"
            });

            // 2. DROP THE "REQUIRED" INDEX ON EXPIRY_DATE
            // This stops the "Path is required" error instantly
            await db.collection('users').dropIndex("expiry_date_1").catch(() => { });

            // 3. RE-SYNC INDEXES FROM YOUR NEW USER.JS
            await User.syncIndexes();

            console.log("🔥 DATABASE RESTRAINTS REMOVED: Expiry is no longer required.");
        } catch (err) {
            console.log("ℹ️ Database indexes already clean.");
        }
    })
    .catch(err => console.error("❌ MongoDB Error:", err));

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
    // Uses ADMIN_SECRET from Railway env
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

        const gamePrefixMap = { "FiveM": "FIVM", "GTAV": "GTAV", "Warzone": "WARZ", "CS2": "CS2X" };
        const firstGame = (games && games.length > 0) ? games[0] : "FiveM";
        const prefix = gamePrefixMap[firstGame] || "GENR";
        const randomPart = crypto.randomBytes(6).toString('hex').toUpperCase().match(/.{4}/g).join('-');
        const newKey = `${prefix}-${randomPart}`;

        const newUser = new User({
            license_key: newKey,
            email: email ? email.toLowerCase() : `pending_${randomPart}@auth.com`,
            password: password || null,
            hwid: null,
            expiry_date: null,
            duration_days: daysNum,
            games: games || ["FiveM"]
        });

        await newUser.save();

        res.json({
            success: true,
            key: newKey,
            expires: "Pending Activation",
            games: newUser.games
        });
    } catch (err) {
        if (err.code === 11000) return res.status(400).json({ success: false, error: "Email already exists" });
        res.status(500).json({ success: false, error: err.message });
    }
});

// --- ADMIN: UNIFIED MANAGEMENT (FULLY FIXED) ---
app.post('/admin/:action', verifyAdmin, async (req, res) => {
    const safeJson = (obj) => res.json(obj);

    try {
        const { license_key, email, password, profile_pic } = req.body;

        // 1. Get the raw action from the URL and clean it
        const rawAction = req.params.action ? req.params.action.toLowerCase().trim() : "";
        console.log(`[ADMIN] Incoming Action: ${rawAction}`);

        // 2. HANDLE LOAD-KEYS FIRST (Check this BEFORE stripping '-key')
        // This prevents "load-keys" from becoming "load-s"
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

        // 3. For all other actions (ban-key, pause-key, etc), strip the suffix
        const cleanAction = rawAction.replace('-key', '').trim();

        // 4. FIND USER (Only for actions that need a specific key)
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

        // 6. REMAINING ACTIONS (Using cleanAction)
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
                    // 1. Clear the HWID lock (Working)
                    user.hwid = null;
                    await user.save();

                    // 2. Find and Update the status (THE PART THAT IS CURRENTLY BEING SKIPPED)
                    const result = await mongoose.connection.collection('requests').updateOne(
                        { license_key: license_key.toUpperCase(), status: "PENDING" },
                        { $set: { status: "APPROVED" } },
                        { sort: { date: -1 } }
                    );

                    console.log(`[ADMIN] HWID Reset & Approved for ${license_key}`);

                    // 3. Return this SPECIFIC message so we know it worked
                    return res.json({ success: true, message: "Approved" });

                } catch (err) {
                    console.error("Reset Error:", err);
                    return res.json({ success: false, error: "Database sync failed" });
                }

            case 'deny-hwid':
                // 1. Find the LATEST pending request
                const latestDeny = await mongoose.connection.collection('requests')
                    .find({ license_key: license_key.toUpperCase(), status: "PENDING" })
                    .sort({ date: -1 })
                    .limit(1)
                    .toArray();

                if (latestDeny.length > 0) {
                    // 2. Update it to DENIED
                    await mongoose.connection.collection('requests').updateOne(
                        { _id: latestDeny[0]._id },
                        { $set: { status: "DENIED" } }
                    );
                    console.log(`[❌] ADMIN PANEL: Denied Request for ${license_key}`);
                }
                return safeJson({ success: true, message: "Denied" });

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

// --- 6. USER LOGIN ---
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

        if (!user.expiry_date) {
            const now = new Date();
            const expiry = new Date();
            const days = user.duration_days || 30;

            if (days === 999) {
                expiry.setFullYear(expiry.getFullYear() + 50);
            } else {
                expiry.setTime(now.getTime() + (days * 24 * 60 * 60 * 1000));
            }

            user.expiry_date = expiry;
            await user.save();
            console.log(`[AUTH] Key ${cleanKey} activated for ${days} days.`);
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

        if (!hwid || !license_key || type !== "MANUAL_RESET") {
            return res.status(400).json({ success: false, error: "Invalid Request Format" });
        }

        const upperKey = license_key.toUpperCase();
        console.log(`[!] RESET REQUEST | Key: ${upperKey} | HWID: ${hwid}`);

        // --- 1. SAVE TO DATABASE ---
        await mongoose.connection.collection('requests').insertOne({
            hwid: hwid,
            license_key: upperKey,
            type: type,
            status: "PENDING",
            date: new Date()
        });
        console.log(`[✅] DB SUCCESS: Saved to requests table.`);

        // --- 2. SEND TO DISCORD ---
        const DISCORD_WEBHOOK = "https://discord.com/api/webhooks/1375161068317573253/mK3ucW0iJcN9nj96LJ1L_0bSeCtx-dQMedS9kxvdz49Qhpsd1GCfWb3fRydp_b1Z1OT_";
        if (DISCORD_WEBHOOK.includes("discord.com")) {
            await fetch(DISCORD_WEBHOOK, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    content: `📢 **HWID RESET REQUEST**\n**Key:** \`${upperKey}\`\n**New HWID:** \`${hwid}\``
                })
            });
        }

        return res.json({ success: true, message: "Admin notified." });

    } catch (err) {
        console.error("[❌] Server/DB Error:", err);
        if (!res.headersSent) {
            return res.status(500).json({ success: false, error: "Internal Server Error" });
        }
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
