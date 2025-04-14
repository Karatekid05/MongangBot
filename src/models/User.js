const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    userId: {
        type: String,
        required: true,
        unique: true
    },
    username: {
        type: String,
        required: true
    },
    gangId: {
        type: String,
        required: true
    },
    walletAddress: {
        type: String,
        default: ""
    },
    // Campos para verificação de carteira
    walletVerified: {
        type: Boolean,
        default: false
    },
    verificationTxHash: {
        type: String,
        default: null
    },
    verificationPending: {
        type: Boolean,
        default: false
    },
    verificationAmount: {
        type: Number,
        default: 0
    },
    verificationTimestamp: {
        type: Date,
        default: null
    },
    cash: {
        type: Number,
        default: 0
    },
    // Track weekly points for weekly leaderboards
    weeklyCash: {
        type: Number,
        default: 0
    },
    // Track last rewarded message timestamp for cooldown
    lastMessageReward: {
        type: Date,
        default: null
    },
    // Track NFT holdings
    nfts: {
        collection1Count: {
            type: Number,
            default: 0
        },
        collection2Count: {
            type: Number,
            default: 0
        }
    },
    // Track points awarded by source
    pointsBySource: {
        games: {
            type: Number,
            default: 0
        },
        memesAndArt: {
            type: Number,
            default: 0
        },
        chatActivity: {
            type: Number,
            default: 0
        },
        others: {
            type: Number,
            default: 0
        },
        nftRewards: {
            type: Number,
            default: 0
        }
    }
}, { timestamps: true });

const User = mongoose.model('User', userSchema);

module.exports = User; 