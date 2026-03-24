const mongoose = require('mongoose');

const adminUserSchema = new mongoose.Schema({
    email: {
        type: String,
        required: true,
        unique: true,
        trim: true,
        lowercase: true
    },
    password_hash: {
        type: String,
        required: true
    },
    label: {
        type: String,
        default: 'VEXION Admin'
    },
    role: {
        type: String,
        enum: ['owner', 'admin'],
        default: 'admin'
    },
    is_active: {
        type: Boolean,
        default: true
    },
    created_by: {
        type: String,
        default: 'system'
    },
    last_login_at: {
        type: Date,
        default: null
    }
}, {
    timestamps: true
});

module.exports = mongoose.models.AdminUser || mongoose.model('AdminUser', adminUserSchema, 'admin_users');
