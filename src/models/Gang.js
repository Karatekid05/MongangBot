const mongoose = require('mongoose');

const gangSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true
    },
    roleId: {
        type: String,
        required: true,
        unique: true
    },
    channelId: {
        type: String,
        required: true,
        unique: true
    },
    trophies: {
        type: Number,
        default: 0
    },
    // Track total cash of all members for gang leaderboard
    totalCash: {
        type: Number,
        default: 0
    },
    // Track weekly cash for weekly leaderboards
    weeklyTotalCash: {
        type: Number,
        default: 0
    }
}, { timestamps: true });

const Gang = mongoose.model('Gang', gangSchema);

module.exports = Gang; 