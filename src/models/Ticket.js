const mongoose = require('mongoose');

const ticketSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        unique: true
    },
    description: {
        type: String,
        required: true
    },
    price: {
        type: Number,
        required: true,
        min: 0
    },
    maxTickets: {
        type: Number,
        required: true,
        min: 1
    },
    soldTickets: {
        type: Number,
        default: 0
    },
    roleId: {
        type: String,
        required: true
    },
    roleName: {
        type: String,
        required: true
    },
    eventType: {
        type: String,
        enum: ['lottery', 'poker', 'tournament', 'custom'],
        required: true
    },
    status: {
        type: String,
        enum: ['active', 'paused', 'completed', 'cancelled', 'pre_delete'],
        default: 'active'
    },
    // Data limite simples
    timeLimitDate: {
        type: Date,
        default: null
    },
    // Para loterias
    lottery: {
        prizePool: {
            type: Number,
            default: 0
        },
        winners: [{
            position: Number,
            userId: String,
            username: String,
            prize: Number
        }],
        drawn: {
            type: Boolean,
            default: false
        },
        drawDate: {
            type: Date,
            default: null
        }
    },
    // Para poker/torneios
    tournament: {
        buyIn: {
            type: Number,
            default: 0
        },
        prizeDistribution: [{
            position: Number,
            percentage: Number
        }],
        participants: [{
            userId: String,
            username: String,
            eliminated: {
                type: Boolean,
                default: false
            },
            position: Number,
            prize: Number
        }],
        started: {
            type: Boolean,
            default: false
        },
        finished: {
            type: Boolean,
            default: false
        }
    },
    // Configurações simplificadas
    settings: {
        autoAssignRole: {
            type: Boolean,
            default: true
        },
        maxTicketsPerUser: {
            type: Number,
            default: 1
        }
    }
}, { timestamps: true });

// Método para verificar se ainda há tickets disponíveis
ticketSchema.methods.hasAvailableTickets = function () {
    if (this.status !== 'active') return false;

    // Verificar limite de tempo
    if (this.timeLimitDate && new Date() > this.timeLimitDate) {
        return false;
    }

    return this.soldTickets < this.maxTickets;
};

// Método para obter tickets disponíveis
ticketSchema.methods.getAvailableTickets = function () {
    return Math.max(0, this.maxTickets - this.soldTickets);
};

// Método para calcular receita total
ticketSchema.methods.getTotalRevenue = function () {
    return this.soldTickets * this.price;
};

// Método para verificar se expirou
ticketSchema.methods.isExpired = function () {
    return this.timeLimitDate && new Date() > this.timeLimitDate;
};

// Método para marcar como pre-delete (estado final)
ticketSchema.methods.markAsPreDelete = function () {
    this.status = 'pre_delete';
    return this.save();
};

const Ticket = mongoose.model('Ticket', ticketSchema);

module.exports = Ticket; 