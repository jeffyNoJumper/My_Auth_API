const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  license_key: { type: String, required: true, unique: true },
  hwid: { type: String, default: null }, // Locked after first login
  expiry_date: { type: Date, required: true },
  profile_pic: { type: String, default: "https://i.imgur.com" },
  games: { 
    type: [String], 
    default: ["FiveM", "GTAV", "Warzone", "CS2"] 
  },
  is_banned: { type: Boolean, default: false }
});

module.exports = mongoose.model('User', userSchema);
