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


// --- USER: LOGIN ---
app.post('/login', async (req, res) => {
    try {
        const { license_key, hwid } = req.body;

        const user = await User.findOne({
            license_key: license_key.toUpperCase()
        });

        if (!user)
            return res.json({ error: "Invalid Key" });

        if (user.is_banned)
            return res.json({ error: "Key Banned" });

        if (user.is_paused)
            return res.json({ error: "Key Paused" });

        if (new Date() > user.expiry_date)
            return res.json({ error: "Key Expired" });

        if (!user.hwid) {
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

// --- ADMIN: HWID RESET ---
app.post('/reset-hwid', async (req, res) => {
    try {
        const { license_key, admin_password } = req.body;

        if (admin_password !== process.env.ADMIN_SECRET) {
            return res.status(401).json({ error: "Unauthorized" });
        }

        const user = await User.findOne({ license_key });
        if (!user) return res.status(404).json({ error: "Key not found" });

        user.hwid = null;
        await user.save();

        res.json({ success: true, message: "HWID reset successfully." });
    } catch (error) {
        res.status(500).json({ error: "Internal Server Error" });
    }
});

app.post('/admin/pause-key', verifyAdmin, async (req, res) => {
    const { license_key } = req.body;

    await User.updateOne(
        { license_key: license_key.toUpperCase() },
        { is_paused: true }
    );

    res.json({ success: true });
});

app.post('/admin/unpause-key', verifyAdmin, async (req, res) => {
    const { license_key } = req.body;

    await User.updateOne(
        { license_key: license_key.toUpperCase() },
        { is_paused: false }
    );

    res.json({ success: true });
});

app.post('/admin/ban-key', verifyAdmin, async (req, res) => {
    const { license_key } = req.body;

    await User.updateOne(
        { license_key: license_key.toUpperCase() },
        { is_banned: true }
    );

    res.json({ success: true });
});

app.post('/admin/delete-key', verifyAdmin, async (req, res) => {
    const { license_key } = req.body;

    await User.deleteOne({
        license_key: license_key.toUpperCase()
    });

    res.json({ success: true });
});

app.post('/admin/get-key', verifyAdmin, async (req, res) => {
    try {
        const { license_key } = req.body;
        const user = await User.findOne({ license_key: license_key.toUpperCase() });
        if (!user) return res.status(404).json({ error: "Key not found" });

        res.json({
            success: true,
            key: user.license_key,
            is_banned: user.is_banned,
            is_paused: user.is_paused || false,
            hwid: user.hwid,
            expiry: user.expiry_date,
            games: user.games,
        });
    } catch (err) {
        console.error("Get Key Error:", err);
        res.status(500).json({ error: "Internal Server Error" });
    }
});
function verifyAdmin(req, res, next) {
    const { admin_password } = req.body;

    if (admin_password !== process.env.ADMIN_SECRET) {
        return res.status(401).json({ error: "Unauthorized" });
    }

    next();
}

app.get('/', (req, res) => res.send('API Online & Connected.'));

const PORT = process.env.PORT || 8080;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Health Check Active: Listening on port ${PORT}`);
});

// DB connection stays at the bottom or top, but doesn't block the listener
mongoose.connect(process.env.MONGO_URL)
    .then(() => console.log("✅ Connected to MongoDB"))
    .catch(err => console.error("❌ MongoDB Error:", err));

