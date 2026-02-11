require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const User = require('../src/user'); // Ensure this path is correct on Railway!
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

// --- ADMIN: CREATE KEY ---
app.post('/admin/create-key', async (req, res) => {
    try {
        const { admin_password, days, games } = req.body;

        // Matches 'FamilyFirst1!' set in Railway Variables
        if (admin_password !== process.env.ADMIN_SECRET) {
            console.log("Admin login attempt failed: Wrong Password");
            return res.status(401).json({ error: "Unauthorized" });
        }

        const newKey = crypto.randomBytes(6).toString('hex').toUpperCase().match(/.{4}/g).join('-');
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
        res.json({ success: true, key: newKey, expires: expiry });

    } catch (err) {
        console.error("Create Key Error:", err);
        res.status(500).json({ error: err.message });
    }
});

// --- USER: LOGIN ---
app.post('/login', async (req, res) => {
    try {
        const { license_key, hwid } = req.body;
        if (!license_key || !hwid) return res.status(400).json({ error: "Missing data" });

        const user = await User.findOne({ license_key });
        if (!user) return res.status(404).json({ error: "Invalid Key" });
        if (user.is_banned) return res.status(403).json({ error: "Banned" });
        if (new Date() > user.expiry_date) return res.status(403).json({ error: "Expired" });

        if (!user.hwid) {
            user.hwid = hwid;
            await user.save();
        } else if (user.hwid !== hwid) {
            return res.status(403).json({ error: "HWID Mismatch" });
        }

        const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '24h' });
        res.json({ token, expiry: user.expiry_date, profile_pic: user.profile_pic, games: user.games });
    } catch (error) {
        console.error("Login Error:", error);
        res.status(500).json({ error: "Server Error" });
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

app.get('/', (req, res) => res.send('API Online.'));

const PORT = process.env.PORT || 8080;
app.listen(PORT, '0.0.0.0', () => console.log(`Server listening on port ${PORT}`));
