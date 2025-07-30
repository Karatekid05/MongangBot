const mongoose = require('mongoose');

const marketPurchaseSchema = new mongoose.Schema({
    itemId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'MarketItem',
        required: true
    },
    userId: {
        type: String,
        required: true
    },
    username: {
        type: String,
        required: true
    },
    price: {
        type: Number,
        required: true
    },
    roleId: {
        type: String,
        required: true
    },
    durationHours: {
        type: Number,
        default: 0
    },
    purchasedAt: {
        type: Date,
        default: Date.now
    },
    expiresAt: {
        type: Date,
        default: null
    },
    isActive: {
        type: Boolean,
        default: true
    }
});

// Calculate expiration date if duration is set
marketPurchaseSchema.pre('save', function(next) {
    if (this.durationHours > 0 && !this.expiresAt) {
        this.expiresAt = new Date(Date.now() + (this.durationHours * 60 * 60 * 1000));
    }
    next();
});

module.exports = mongoose.model('MarketPurchase', marketPurchaseSchema); 