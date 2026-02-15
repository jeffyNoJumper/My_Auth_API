require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const User = require('./user');
const crypto = require('crypto');
const cors = require('cors');


const app = express();

// Middleware
app.use(cors());
app.use(express.json());


// MongoDB Connection
mongoose.connect(process.env.MONGO_URL)
    .then(() => console.log("✅ Connected to MongoDB"))
    .catch(err => console.error("❌ MongoDB Error:", err));

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
        const { days, games } = req.body;
        const gamePrefixMap = { "FiveM": "FIVM", "GTAV": "GTAV", "Warzone": "WARZ", "CS2": "CS2X" };
        const firstGame = (games && games.length > 0) ? games[0] : "FiveM";
        const prefix = gamePrefixMap[firstGame] || "GENR";
        const randomPart = crypto.randomBytes(6).toString('hex').toUpperCase().match(/.{4}/g).join('-');
        const newKey = `${prefix}-${randomPart}`;

        const expiry = new Date();
        if (days < 1) {
            // For fractional days, treat as hours
            expiry.setTime(expiry.getTime() + days * 24 * 60 * 60 * 1000);
        } else {
            expiry.setDate(expiry.getDate() + Math.floor(days));
        }


        const newUser = new User({
            license_key: newKey,
            hwid: null,
            expiry_date: expiry,
            games: games || ["FiveM"],
            profile_pic: "https://i.imgur.com"
        });

        await newUser.save();
        res.json({ success: true, key: newKey, expires: expiry, games: newUser.games });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// --- 3. GET KEY INFO (MUST BE ABOVE DYNAMIC ROUTES) ---
app.post('/admin/get-key', verifyAdmin, async (req, res) => {
    try {
        const { license_key } = req.body;
        const user = await User.findOne({ license_key: license_key.toUpperCase() });
        if (!user) return res.status(404).json({ success: false, error: "Key not found" });

        const request = await Request.findOne({ license_key: upperKey, status: "PENDING" });

        res.json({
            success: true,
            is_banned: user.is_banned || false,
            is_paused: user.is_paused || false,
            hwid: user.hwid,
            expiry: user.expiry_date,
            games: user.games,
            pending_request: request
        });
    } catch (err) {
        res.status(500).json({ success: false, error: "Internal Server Error" });
    }
});

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
        const { license_key } = req.body;
        const action = req.params.action.toLowerCase();

        let user = null;
        if (license_key) {
            user = await User.findOne({ license_key: license_key.toUpperCase() });
        }

        // Allow load-keys without a user
        if (!user && !['delete-key', 'load-keys'].includes(action)) {
            return safeJson({ success: false, error: "Key not found" });
        }

        switch (action) {

            case 'load-keys':
                try {
                    const keys = await User.find({}, 'license_key expiry_date is_banned is_paused games').lean();
                    // Lean ensures plain JS objects, safe for JSON
                    return safeJson({
                        success: true, keys: keys.map(k => ({
                            license_key: k.license_key,
                            expiry: k.expiry_date,
                            is_banned: k.is_banned || false,
                            is_paused: k.is_paused || false,
                            games: k.games || []
                        }))
                    });
                } catch (err) {
                    console.error("Load keys error:", err);
                    return safeJson({ success: false, keys: [], error: "Failed to fetch keys" });
                }

            case 'get-key':
                return safeJson({
                    success: true,
                    is_banned: user.is_banned || false,
                    is_paused: user.is_paused || false,
                    hwid: user.hwid || null,
                    expiry: user.expiry_date,
                    games: user.games || []
                });

            case 'reset-hwid':
                user.hwid = null;
                await user.save();
                return safeJson({ success: true, message: "HWID reset successfully." });

            case 'pause-key':
                user.is_paused = true;
                await user.save();
                return safeJson({ success: true, message: "Key paused successfully." });

            case 'unpause-key':
                user.is_paused = false;
                await user.save();
                return safeJson({ success: true, message: "Key unpaused successfully." });

            case 'ban-key':
                user.is_banned = true;
                await user.save();
                return safeJson({ success: true, message: "Key banned successfully." });

            case 'delete-key':
                await User.deleteOne({ license_key: license_key.toUpperCase() });
                return safeJson({ success: true, message: "Key deleted successfully." });

            default:
                return safeJson({ success: false, error: `Invalid Action: ${action}` });
        }

    } catch (err) {
        console.error("Admin Route Error:", err);
        return safeJson({ success: false, error: "Internal Server Error" });
    }
});

// --- 6. USER LOGIN ---
app.post('/login', async (req, res) => {
    try {
        const { license_key, hwid } = req.body;
        const user = await User.findOne({ license_key: license_key.toUpperCase() });

        if (!user) return res.json({ error: "Invalid Key" });
        if (user.is_banned) return res.json({ error: "Key Banned" });
        if (user.is_paused) return res.json({ error: "Key Paused" });
        if (new Date() > user.expiry_date) return res.json({ error: "Key Expired" });

        if (!user.hwid || user.hwid === "null") {
            user.hwid = hwid;
        } else if (user.hwid !== hwid) {
            return res.json({ error: "HWID Mismatch" });
        }

        await user.save();
        res.json({ token: "VALID", profile_pic: user.profile_pic, expiry: user.expiry_date });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/request-hwid-reset', async (req, res) => {
    try {
        const { hwid, license_key, type } = req.body;

        if (!hwid || !license_key || type !== "MANUAL_RESET") {
            return res.status(400).json({ success: false, error: "Invalid Request Format" });
        }

        console.log(`[!] RESET REQUEST | Key: ${license_key} | HWID: ${hwid}`);

        // 2. Send to Discord (Optional)
        const DISCORD_WEBHOOK = "YOUR_DISCORD_WEBHOOK_URL";

        if (DISCORD_WEBHOOK.includes("discord.com")) {
            await fetch(DISCORD_WEBHOOK, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    content: `📢 **HWID RESET REQUEST**\n**Key:** \`${license_key}\`\n**New HWID:** \`${hwid}\``
                })
            });
        }

        return res.json({ success: true, message: "Admin notified." });

    } catch (err) {
        console.error("Server Error:", err);
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
