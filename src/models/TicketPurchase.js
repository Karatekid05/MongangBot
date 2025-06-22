const mongoose = require('mongoose');

const ticketPurchaseSchema = new mongoose.Schema({
    ticketId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Ticket',
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
    quantity: {
        type: Number,
        required: true,
        min: 1
    },
    totalPrice: {
        type: Number,
        required: true,
        min: 0
    },
    purchaseDate: {
        type: Date,
        default: Date.now
    },
    status: {
        type: String,
        enum: ['active', 'refunded', 'cancelled'],
        default: 'active'
    },
    // Para loterias - número do ticket
    ticketNumbers: [{
        type: Number
    }],
    // Para torneios - informações do participante
    tournamentInfo: {
        eliminated: {
            type: Boolean,
            default: false
        },
        position: {
            type: Number,
            default: null
        },
        prize: {
            type: Number,
            default: 0
        }
    },
    // Role atribuído
    roleAssigned: {
        type: Boolean,
        default: false
    },
    roleId: {
        type: String,
        default: null
    }
}, { timestamps: true });

// Índices para melhor performance
ticketPurchaseSchema.index({ ticketId: 1, userId: 1 });
ticketPurchaseSchema.index({ userId: 1 });
ticketPurchaseSchema.index({ status: 1 });

const TicketPurchase = mongoose.model('TicketPurchase', ticketPurchaseSchema);

module.exports = TicketPurchase; 