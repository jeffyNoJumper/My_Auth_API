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

// MongoDB Connection
mongoose.connect(process.env.MONGO_URL)
    .then(() => console.log("✅ Connected to MongoDB"))
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
        const daysNum = parseFloat(days); // Ensure we handle decimals like 0.0416

        const gamePrefixMap = { "FiveM": "FIVM", "GTAV": "GTAV", "Warzone": "WARZ", "CS2": "CS2X" };
        const firstGame = (games && games.length > 0) ? games[0] : "FiveM";
        const prefix = gamePrefixMap[firstGame] || "GENR";
        const randomPart = crypto.randomBytes(6).toString('hex').toUpperCase().match(/.{4}/g).join('-');
        const newKey = `${prefix}-${randomPart}`;

        const expiry = new Date();
        if (daysNum === 999) {
            expiry.setFullYear(expiry.getFullYear() + 50); // Lifetime
        } else {
            // Precise millisecond math for hours/days
            const msToAdd = daysNum * 24 * 60 * 60 * 1000;
            expiry.setTime(expiry.getTime() + msToAdd);
        }

        const newUser = new User({
            email: email ? email.toLowerCase() : "skuser@loader.com",
            password: password || "changeme123",
            license_key: newKey,
            hwid: null,
            expiry_date: expiry,
            games: games || ["FiveM"],
            profile_pic: ""
        });

        await newUser.save();
        res.json({ success: true, key: newKey, expires: expiry, games: newUser.games });
    } catch (err) {
        if (err.code === 11000) return res.status(400).json({ success: false, error: "Email already exists" });
        res.status(500).json({ success: false, error: err.message });
    }
});

/*
app.post('/admin/get-key', verifyAdmin, async (req, res) => {
    try {
        const { license_key } = req.body;
        if (!license_key) return res.status(400).json({ success: false, error: "No key provided" });

        const upperKey = license_key.toUpperCase();
        const user = await User.findOne({ license_key: upperKey });
        if (!user) return res.status(404).json({ success: false, error: "Key not found" });

        let pendingRequest = null;
        try {
            pendingRequest = await Request.findOne({ license_key: upperKey, status: "PENDING" });
        } catch (dbErr) {
            console.log("Request DB check failed.");
        }

        res.json({
            success: true,
            is_banned: user.is_banned || false,
            is_paused: user.is_paused || false,
            hwid: user.hwid,
            expiry: user.expiry_date,
            games: user.games,
            pending_request: pendingRequest
        });
    } catch (err) {
        console.error("CRASH IN GET-KEY:", err.message);
        res.status(500).json({ success: false, error: "Internal Server Error" });
    }
});
*/

// --- 4. HWID RESET ---
app.post('/admin/reset-hwid', verifyAdmin, async (req, res) => {
    try {
        const { license_key } = req.body;
        const user = await User.findOneAndUpdate(
            { license_key: license_key.toUpperCase() },
            { hwid: null },
            { new: true }
        );
        if (!user) return res.status(404).json({ success: false, error: "Key not found" });
        res.json({ success: true, message: "HWID cleared successfully." });
    } catch (error) {
        res.status(500).json({ success: false, error: "Internal Server Error" });
    }
});

// --- ADMIN: UNIFIED MANAGEMENT ---
app.post('/admin/:action', verifyAdmin, async (req, res) => {
    const safeJson = (obj) => res.json(obj);

    try {
        const { license_key, email, password, profile_pic } = req.body;

        // Normalize action: remove "-key" suffix and trim spaces
        const rawAction = req.params.action.toLowerCase().trim();
        const action = rawAction.endsWith('-key') ? rawAction.replace('-key', '') : rawAction;

        let user = null;
        if (license_key) {
            user = await User.findOne({ license_key: license_key.toUpperCase() });
        }

        // Allow load-keys without a user
        if (!user && !['delete', 'load-keys'].includes(action)) {
            return safeJson({ success: false, error: "Key not found" });
        }

        switch (action) {
            case 'update': // Handles linking email/password
                if (email) user.email = email.toLowerCase();
                if (password) user.password = password;
                await user.save();
                return safeJson({ success: true, message: `Linked ${email} successfully.` });

            case 'load-keys':
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
                    return safeJson({ success: false, error: "Failed to load keys" });
                }

            case 'update-pfp':
                if (user) {
                    user.profile_pic = profile_pic;
                    await user.save();
                    return safeJson({ success: true, message: "PFP Updated" });
                }
                return safeJson({ success: false, error: "User not found" });

            case 'get':
            case 'get-key':
                let pendingRequest = null;
                try {
                    pendingRequest = await mongoose.model('Request').findOne({
                        license_key: license_key.toUpperCase(),
                        status: "PENDING"
                    });
                } catch (e) { /* ignore */ }

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

            case 'deny-hwid':
                await mongoose.model('Request').findOneAndUpdate(
                    { license_key: license_key.toUpperCase(), status: "PENDING" },
                    { status: "DENIED" }
                );
                return safeJson({ success: true, message: "Request Denied." });

            case 'reset-hwid':
                user.hwid = null;
                await user.save();
                // Approve the request so the user's loader terminal sees the update
                await mongoose.model('Request').findOneAndUpdate(
                    { license_key: license_key.toUpperCase(), status: "PENDING" },
                    { status: "APPROVED" }
                );
                return safeJson({ success: true, message: "HWID Reset & Approved." });

            case 'pause-key':
            case 'pause':
                user.is_paused = true;
                await user.save();
                return safeJson({ success: true, message: "Key paused successfully." });

            case 'unpause-key':
            case 'unpause':
                user.is_paused = false;
                await user.save();
                return safeJson({ success: true, message: "Key unpaused successfully." });

            case 'ban-key':
            case 'ban':
                user.is_banned = true;
                await user.save();
                return safeJson({ success: true, message: "Key banned successfully." });

            case 'unban-key':
            case 'unban':
                user.is_banned = false;
                await user.save();
                return safeJson({ success: true, message: "User unbanned successfully." });

            case 'delete-key':
            case 'delete':
                await User.deleteOne({ license_key: license_key.toUpperCase() });
                return safeJson({ success: true, message: "Key deleted successfully." });

            default:
                return safeJson({ success: false, error: `Invalid Action: ${action}` });
        }
});

// --- 6. USER LOGIN (FINAL SECURE VERSION) ---
app.post('/login', async (req, res) => {
    try {
        const { email, password, license_key, hwid } = req.body;

        if (!email || !password || !license_key) {
            return res.json({ error: "Missing required fields" });
        }

        const cleanEmail = email.toLowerCase().trim();
        const cleanKey = license_key.toUpperCase().trim();
        const cleanPass = password.trim();

        // 1. Find user by email and key
        const user = await User.findOne({ email: cleanEmail, license_key: cleanKey });

        if (!user) return res.json({ error: "Invalid Email or License Key" });

        // 2. AUTO-REGISTRATION: If password field is missing, null, or empty string
        if (!user.password || user.password === "" || user.password === null) {
            user.password = cleanPass;
            await user.save();
            console.log(`[AUTH] First-time registration success for: ${cleanEmail}`);
        }
        // 3. VALIDATION: Standard check
        else if (user.password !== cleanPass) {
            return res.json({ error: "Invalid Password" });
        }

        // 4. STATUS CHECKS
        if (user.is_banned) return res.json({ error: "Account Banned" });
        if (user.is_paused) return res.json({ error: "Subscription Paused" });
        if (new Date() > user.expiry_date) return res.json({ error: "Subscription Expired" });

        // 5. HWID LOCKING
        if (!user.hwid || user.hwid === "null" || user.hwid === null) {
            user.hwid = hwid;
            await user.save();
        } else if (user.hwid !== hwid) {
            // Using your existing HWID logic
            return res.json({ error: "HWID Mismatch. Please request a reset." });
        }

        // 6. SUCCESS RESPONSE
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

app.get('/check-reset-status', async (req, res) => {
    try {
        const { key } = req.query;
        if (!key) return res.json({ status: "NONE" });

        // Look for the latest request for this specific key
        const request = await mongoose.model('Request').findOne({
            license_key: key.toUpperCase()
        }).sort({ date: -1 });

        // Returns "PENDING", "APPROVED", or "DENIED"
        res.json({ status: request ? request.status : "NONE" });
    } catch (err) {
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

app.get('/', (req, res) => res.send('API Online & Connected.'));

const PORT = process.env.PORT || 8080;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 API Active on port ${PORT}`);
});
