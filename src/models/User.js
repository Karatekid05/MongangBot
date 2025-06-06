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
    // Track total points awarded by source
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
    },
    // Track weekly points by source
    weeklyPointsBySource: {
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
    },
    // Histórico de contribuições por gang
    // Quando um usuário muda de gang, o cash já acumulado fica com a gang anterior
    gangContributions: {
        type: Map,
        of: Number,
        default: {}
    },
    // Gang anterior (para referência)
    previousGangId: {
        type: String,
        default: null
    }
}, { timestamps: true });

const User = mongoose.model('User', userSchema);

module.exports = User; 