const mongoose = require('mongoose');

const marketMessageSchema = new mongoose.Schema({
    channelId: {
        type: String,
        required: true,
        unique: true
    },
    messageId: {
        type: String,
        required: true
    },
    logChannelId: {
        type: String,
        required: true
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
marketMessageSchema.pre('save', function(next) {
    this.updatedAt = new Date();
    next();
});

module.exports = mongoose.model('MarketMessage', marketMessageSchema); 