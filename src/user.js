const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    // Email is optional so keys can be generated alone, 
    // but unique/sparse ensures no two users share an email later.
    email: {
        type: String,
        required: false,
        unique: true,
        sparse: true,
        default: null
    },

    // Password is now optional to allow Key-only records
    password: {
        type: String,
        required: false,
        default: null
    },

    license_key: {
        type: String,
        required: false,
        unique: true,
        sparse: true,
        default: null
    },

    hwid: {
        type: String,
        default: null
    },

    expiry_date: {
        type: Date,
        required: false,
        default: null
    },

    duration_days: {
        type: Number,
        default: 30
    },

    is_banned: {
        type: Boolean,
        default: false
    },

    is_paused: {
        type: Boolean,
        default: false
    },

    games: {
        type: [String],
        default: []
    }
}, {
    timestamps: true,
    
    strict: false
});

module.exports = mongoose.model('User', userSchema);
