require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const User = require('./user');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const cors = require('cors');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// MongoDB Connection (Fixed to connect only once)
mongoose.connect(process.env.MONGO_URL)
    .then(() => console.log("✅ Connected to MongoDB"))
    .catch(err => console.error("MongoDB Connection Error:", err));

app.post('/admin/create-key', async (req, res) => {
    try {
        const { admin_password, days, games } = req.body;

        if (admin_password !== process.env.ADMIN_SECRET) {
            console.log("Admin login attempt failed: Wrong Password");
            return res.status(401).json({ error: "Unauthorized" });
        }

        // Pick first game for prefix
        const gamePrefixMap = {
            "FiveM": "FIVM",
            "GTAV": "GTAV",
            "Warzone": "WARZ",
            "CS2": "CS2X"
        };

        const firstGame = (games && games.length > 0) ? games[0] : "FiveM";
        const prefix = gamePrefixMap[firstGame] || "GENR"; // fallback

        // Generate random rest of key
        const randomPart = crypto.randomBytes(6).toString('hex').toUpperCase().match(/.{4}/g).join('-');

        const newKey = `${prefix}-${randomPart}`;

        // Set expiry
        const expiry = new Date();
        expiry.setDate(expiry.getDate() + (parseInt(days) || 30));

        const newUser = new User({
            license_key: newKey,
            hwid: null,
            expiry_date: expiry,
            games: games || ["FiveM", "GTAV", "Warzone", "CS2"],
            profile_pic: "https://i.imgur.com"
        });

        await newUser.save();
        console.log(`[ADMIN] Created Key: ${newKey}`);
        res.json({ success: true, key: newKey, expires: expiry, games: newUser.games });

    } catch (err) {
        console.error("Create Key Error:", err);
        res.status(500).json({ error: err.message });
    }
});

// --- 1. ADMIN MIDDLEWARE ---
function verifyAdmin(req, res, next) {
    const { admin_password } = req.body;
    if (!admin_password || admin_password !== process.env.ADMIN_SECRET) {
        return res.status(401).json({ success: false, error: "Unauthorized" });
    }
    next();
}

// --- 2. GET KEY INFO (Must be above the :action route) ---
app.post('/admin/get-key', verifyAdmin, async (req, res) => {
    try {
        const { license_key } = req.body;
        const user = await User.findOne({ license_key: license_key.toUpperCase() });

        if (!user) return res.status(404).json({ success: false, error: "Key not found" });

        res.json({
            success: true,
            is_banned: user.is_banned || false,
            is_paused: user.is_paused || false,
            hwid: user.hwid,
            expiry: user.expiry_date,
            games: user.games
        });
    } catch (err) {
        res.status(500).json({ success: false, error: "Internal Server Error" });
    }
});

// --- 3. HWID RESET ---
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

// --- 4. DYNAMIC ACTIONS (Pause, Unpause, Ban, Delete) ---
app.post('/admin/:action-key', verifyAdmin, async (req, res) => {
    try {
        const { license_key } = req.body;
        const { action } = req.params;

        const user = await User.findOne({ license_key: license_key.toUpperCase() });
        if (!user && action !== 'delete') {
            return res.status(404).json({ error: "Key not found" });
        }

        switch (action) {
            case 'pause':
                user.is_paused = true;
                break;
            case 'unpause':
                user.is_paused = false;
                break;
            case 'ban':
                user.is_banned = true;
                break;
            case 'delete':
                await User.deleteOne({ license_key: license_key.toUpperCase() });
                return res.json({ success: true, message: "Key deleted" });
            default:
                return res.status(400).json({ error: "Invalid action" });
        }

        await user.save();
        res.json({ success: true, message: `Key ${action}ed successfully` });

    } catch (err) {
        console.error(`Error during ${req.params.action}:`, err);
        res.status(500).json({ error: err.message });
    }
});

// --- 5. USER LOGIN ---
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
        res.json({
            token: "VALID",
            profile_pic: user.profile_pic,
            expiry: user.expiry_date
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});



app.get('/', (req, res) => res.send('API Online & Connected.'));

const PORT = process.env.PORT || 8080;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Health Check Active: Listening on port ${PORT}`);
});

// DB connection stays at the bottom or top, but doesn't block the listener
mongoose.connect(process.env.MONGO_URL)
    .then(() => console.log("✅ Connected to MongoDB"))
    .catch(err => console.error("❌ MongoDB Error:", err));

