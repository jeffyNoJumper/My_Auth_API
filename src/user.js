const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    email: { type: String, unique: true, sparse: true, default: null },
    password: {
        type: String,
        required: function () {
            // Only required if email exists
            return this.email != null;
        },
        default: null
    },
    license_key: { type: String, unique: true, sparse: true, default: null },
    hwid: { type: String, default: null },
    expiry_date: { type: Date, default: null },
    duration_days: { type: Number, default: 30 },
    is_banned: { type: Boolean, default: false },
    is_paused: { type: Boolean, default: false },
    games: { type: [String], default: [] }
}, { timestamps: true, strict: false });

module.exports = mongoose.model('User', userSchema);
