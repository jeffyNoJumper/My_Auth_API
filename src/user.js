const userSchema = new mongoose.Schema({
    email: { type: String, required: false, unique: true, sparse: true, default: null },
    password: { type: String, required: false, default: null },
    license_key: { type: String, required: true, unique: true },
    hwid: { type: String, default: null },

    expiry_date: { type: Date, required: false, default: null },

    duration_days: { type: Number, default: 30 },

    is_banned: { type: Boolean, default: false },
    is_paused: { type: Boolean, default: false },
    games: { type: [String], default: [] }
}, {
    timestamps: true,
    strict: false
});
