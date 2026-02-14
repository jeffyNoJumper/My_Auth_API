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
        expiry.setDate(expiry.getDate() + (parseInt(days) || 30));

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

// --- 5. DYNAMIC ACTIONS (Pause, Unpause, Ban, Delete) ---
// Note: Changed :action-key to :action to match your UI's fetch calls
app.post('/admin/:action-key', verifyAdmin, async (req, res) => {
    try {
        const { license_key } = req.body;
        let action = req.params.action;

        // This removes "-key" from the URL if your UI sends /admin/pause-key
        action = action.replace('-key', '');

        const user = await User.findOne({ license_key: license_key.toUpperCase() });
        if (!user && action !== 'delete') {
            return res.status(404).json({ error: "Key not found" });
        }

        switch (action) {
            case 'pause': user.is_paused = true; break;
            case 'unpause': user.is_paused = false; break;
            case 'ban': user.is_banned = true; break;
            case 'delete':
                await User.deleteOne({ license_key: license_key.toUpperCase() });
                return res.json({ success: true, message: "Key deleted" });
            default:
                return res.status(400).json({ error: "Invalid action: " + action });
        }

        await user.save();
        res.json({ success: true, message: `Key ${action}ed successfully` });
    } catch (err) {
        res.status(500).json({ error: err.message });
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

app.get('/', (req, res) => res.send('API Online & Connected.'));

const PORT = process.env.PORT || 8080;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 API Active on port ${PORT}`);
});

