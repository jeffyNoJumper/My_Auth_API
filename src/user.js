const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    email: { type: String, required: false, unique: true, sparse: true },
    password: { type: String, required: false },
    license_key: { type: String, required: true, unique: true },
    hwid: { type: String, default: null },
    expiry_date: { type: Date, required: true },
    is_banned: { type: Boolean, default: false },
    is_paused: { type: Boolean, default: false },
    games: { type: [String], default: [] },
    profile_pic: { type: String, default: "" },
    discord_id: { type: String, default: "" }
});

module.exports = mongoose.model('User', userSchema); 
