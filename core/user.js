const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
    license_key: { type: String, required: true, unique: true },
    hwid: { type: String, default: null },
    expiry_date: { type: Date, required: true },
    is_banned: { type: Boolean, default: false },
    games: { type: [String], default: ["FiveM", "GTAV", "Warzone", "CS2"] },
    profile_pic: { type: String, default: "https://i.imgur.com" }
});

module.exports = mongoose.model('User', UserSchema);
