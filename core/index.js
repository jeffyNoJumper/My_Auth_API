require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const User = require('../src/user');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

const app = express();
app.use(express.json());

// Add error handling to connection
mongoose.connect(process.env.MONGO_URL)
  .then(() => console.log("Connected to MongoDB"))
  .catch(err => console.error("Could not connect:", err));

app.post('/login', async (req, res) => {
  // Wrap everything in a try block to prevent crashes
  try {
    const { license_key, hwid } = req.body;
    
    // Check if data was even sent
    if (!license_key || !hwid) {
        return res.status(400).json({ error: "Missing key or HWID" });
    }

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

    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '1h' });
    
    res.json({
      token,
      expiry: user.expiry_date,
      profile_pic: user.profile_pic,
      games: user.games
    });
    
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

app.post('/admin/create-key', async (req, res) => {
    const { admin_password, days, games } = req.body;

    // Use the variable you set in Railway
    if (admin_password !== process.env.ADMIN_SECRET) {
        return res.status(401).json({ error: "Unauthorized" });
    }

    try {
        // Generates a key like: A1B2-C3D4-E5F6
        const newKey = crypto.randomBytes(6).toString('hex').toUpperCase().match(/.{4}/g).join('-');
        
        const expiry = new Date();
        expiry.setDate(expiry.getDate() + (days || 30));

        const newUser = new User({
            license_key: newKey,
            hwid: null, // Empty so the first person to use it gets locked
            expiry_date: expiry,
            games: games || ["FiveM", "GTAV", "Warzone", "CS2"],
            profile_pic: "https://i.imgur.com"
        });

        await newUser.save();
        res.json({ 
            success: true, 
            key: newKey, 
            expires: expiry,
            note: "Key is now active in MongoDB" 
        });

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
