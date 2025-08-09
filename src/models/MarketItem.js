const mongoose = require('mongoose');

const marketItemSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true
    },
    description: {
        type: String,
        required: true,
        trim: true
    },
    price: {
        type: Number,
        required: true,
        min: 1
    },
    roleId: {
        type: String,
        required: true
    },
    durationHours: {
        type: Number,
        default: 0, // 0 = permanent
        min: 0
    },
    spots: {
        type: Number,
        default: 0, // 0 = unlimited
        min: 0
    },
    soldSpots: {
        type: Number,
        default: 0
    },
    externalWl: {
        type: Boolean,
        default: false
    },
    createdBy: {
        type: String,
        required: true
    },
    isActive: {
        type: Boolean,
        default: true
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
});

// Update the updatedAt field before saving
marketItemSchema.pre('save', function(next) {
    this.updatedAt = new Date();
    next();
});

module.exports = mongoose.model('MarketItem', marketItemSchema); 