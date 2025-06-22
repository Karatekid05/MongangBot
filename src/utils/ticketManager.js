const Ticket = require('../models/Ticket');
const TicketPurchase = require('../models/TicketPurchase');
const User = require('../models/User');
const { awardCash, removeCash } = require('./pointsManager');

/**
 * Criar um novo ticket/evento
 */
async function createTicket(ticketData) {
    try {
        const ticket = new Ticket(ticketData);
        await ticket.save();
        console.log(`Ticket criado: ${ticket.name}`);
        return ticket;
    } catch (error) {
        console.error('Erro ao criar ticket:', error);
        throw error;
    }
}

/**
 * Comprar tickets
 */
async function buyTickets(ticketId, userId, username, quantity, client) {
    try {
        // Buscar o ticket
        const ticket = await Ticket.findById(ticketId);
        if (!ticket) {
            throw new Error('Ticket não encontrado');
        }

        // Verificar se o ticket está ativo
        if (ticket.status !== 'active') {
            throw new Error('Ticket não está disponível para compra');
        }

        // Verificar se há tickets disponíveis
        if (!ticket.hasAvailableTickets()) {
            throw new Error('Não há tickets disponíveis');
        }

        // Verificar se há tickets suficientes
        if (ticket.soldTickets + quantity > ticket.maxTickets) {
            throw new Error(`Só há ${ticket.getAvailableTickets()} tickets disponíveis`);
        }

        // Verificar se o usuário já comprou o máximo permitido
        const userPurchases = await TicketPurchase.find({
            ticketId: ticket._id,
            userId: userId,
            status: 'active'
        });

        const totalUserTickets = userPurchases.reduce((sum, purchase) => sum + purchase.quantity, 0);
        if (totalUserTickets + quantity > ticket.settings.maxTicketsPerUser) {
            throw new Error(`Você já comprou ${totalUserTickets} tickets. Máximo permitido: ${ticket.settings.maxTicketsPerUser}`);
        }

        // Calcular preço total
        const totalPrice = ticket.price * quantity;

        // Verificar se o usuário tem $CASH suficiente
        const user = await User.findOne({ userId });
        if (!user) {
            throw new Error('Usuário não encontrado no sistema');
        }

        if (user.cash < totalPrice) {
            throw new Error(`Você precisa de ${totalPrice} $CASH. Você tem: ${user.cash} $CASH`);
        }

        // Remover $CASH do usuário
        await removeCash(userId, 'ticket_purchase', totalPrice);

        // Criar registro da compra
        const purchase = new TicketPurchase({
            ticketId: ticket._id,
            userId: userId,
            username: username,
            quantity: quantity,
            totalPrice: totalPrice,
            roleId: ticket.roleId
        });

        // Gerar números dos tickets (para loterias)
        if (ticket.eventType === 'lottery') {
            const ticketNumbers = [];
            for (let i = 0; i < quantity; i++) {
                ticketNumbers.push(ticket.soldTickets + i + 1);
            }
            purchase.ticketNumbers = ticketNumbers;
        }

        await purchase.save();

        // Atualizar contador de tickets vendidos
        ticket.soldTickets += quantity;
        await ticket.save();

        // Atribuir role automaticamente se configurado
        if (ticket.settings.autoAssignRole) {
            try {
                const guild = client.guilds.cache.get(process.env.DISCORD_GUILD_ID);
                if (guild) {
                    const member = await guild.members.fetch(userId);
                    if (member) {
                        await member.roles.add(ticket.roleId);
                        purchase.roleAssigned = true;
                        await purchase.save();
                        console.log(`Role ${ticket.roleName} atribuído a ${username}`);
                    }
                }
            } catch (roleError) {
                console.error(`Erro ao atribuir role para ${username}:`, roleError);
            }
        }

        console.log(`${username} comprou ${quantity} tickets de ${ticket.name} por ${totalPrice} $CASH`);
        return { ticket, purchase };

    } catch (error) {
        console.error('Erro ao comprar tickets:', error);
        throw error;
    }
}

/**
 * Listar todos os tickets ativos
 */
async function listActiveTickets() {
    try {
        const tickets = await Ticket.find({ status: 'active' }).sort({ createdAt: -1 });
        return tickets;
    } catch (error) {
        console.error('Erro ao listar tickets:', error);
        throw error;
    }
}

/**
 * Obter detalhes de um ticket
 */
async function getTicketDetails(ticketId) {
    try {
        const ticket = await Ticket.findById(ticketId);
        if (!ticket) {
            throw new Error('Ticket não encontrado');
        }

        // Buscar compras ativas
        const purchases = await TicketPurchase.find({
            ticketId: ticket._id,
            status: 'active'
        });

        // Calcular estatísticas
        const totalParticipants = new Set(purchases.map(p => p.userId)).size;
        const totalRevenue = ticket.getTotalRevenue();

        return {
            ticket,
            statistics: {
                totalParticipants,
                totalRevenue,
                availableTickets: ticket.getAvailableTickets()
            }
        };
    } catch (error) {
        console.error('Erro ao obter detalhes do ticket:', error);
        throw error;
    }
}

/**
 * Realizar sorteio de loteria
 */
async function drawLottery(ticketId, client) {
    try {
        const ticket = await Ticket.findById(ticketId);
        if (!ticket) {
            throw new Error('Ticket não encontrado');
        }

        if (ticket.eventType !== 'lottery') {
            throw new Error('Este ticket não é uma loteria');
        }

        if (ticket.lottery.drawn) {
            throw new Error('O sorteio já foi realizado');
        }

        // Buscar todos os participantes
        const purchases = await TicketPurchase.find({
            ticketId: ticket._id,
            status: 'active'
        });

        if (purchases.length === 0) {
            throw new Error('Não há participantes para o sorteio');
        }

        // Criar array de participantes para sorteio
        const participants = [];
        purchases.forEach(purchase => {
            if (purchase.ticketNumbers) {
                // Para loterias com números específicos
                purchase.ticketNumbers.forEach(ticketNumber => {
                    participants.push({
                        userId: purchase.userId,
                        username: purchase.username,
                        ticketNumber: ticketNumber
                    });
                });
            } else {
                // Para loterias simples
                participants.push({
                    userId: purchase.userId,
                    username: purchase.username
                });
            }
        });

        // Realizar sorteio
        const winners = [];
        const prizeDistribution = [
            { position: 1, percentage: 0.5 },
            { position: 2, percentage: 0.3 },
            { position: 3, percentage: 0.2 }
        ];

        for (let i = 0; i < Math.min(3, participants.length); i++) {
            const randomIndex = Math.floor(Math.random() * participants.length);
            const winner = participants.splice(randomIndex, 1)[0];
            const prize = Math.floor(ticket.lottery.prizePool * prizeDistribution[i].percentage);

            winners.push({
                position: i + 1,
                userId: winner.userId,
                username: winner.username,
                prize: prize,
                ticketNumber: winner.ticketNumber
            });

            // Dar prêmio ao vencedor
            if (prize > 0) {
                await awardCash(winner.userId, 'lottery_prize', prize);
                console.log(`${winner.username} ganhou ${prize} $CASH na loteria ${ticket.name}`);
            }
        }

        // Atualizar ticket com resultados
        ticket.lottery.winners = winners;
        ticket.lottery.drawn = true;
        ticket.lottery.drawDate = new Date();
        ticket.status = 'completed';
        await ticket.save();

        console.log(`Sorteio da loteria ${ticket.name} realizado com ${winners.length} vencedores`);
        return { ticket, winners };

    } catch (error) {
        console.error('Erro ao realizar sorteio:', error);
        throw error;
    }
}

/**
 * Exportar participantes por role
 */
async function getParticipantsByRole(roleId) {
    try {
        const purchases = await TicketPurchase.find({
            roleId: roleId,
            status: 'active'
        }).populate('ticketId');

        const participants = purchases.map(purchase => ({
            userId: purchase.userId,
            username: purchase.username,
            quantity: purchase.quantity,
            totalPrice: purchase.totalPrice,
            purchaseDate: purchase.createdAt,
            ticketName: purchase.ticketId ? purchase.ticketId.name : 'N/A'
        }));

        return participants;
    } catch (error) {
        console.error('Erro ao buscar participantes por role:', error);
        throw error;
    }
}

/**
 * Exportar lista de participantes
 */
async function exportParticipantsList(roleId) {
    try {
        const participants = await getParticipantsByRole(roleId);

        if (participants.length === 0) {
            return 'Nenhum participante encontrado para este role.';
        }

        const csvHeader = 'Username,User ID,Quantidade,Preço Total,Data da Compra,Ticket\n';
        const csvRows = participants.map(p =>
            `"${p.username}","${p.userId}",${p.quantity},${p.totalPrice},"${p.purchaseDate.toLocaleString('pt-BR')}","${p.ticketName}"`
        ).join('\n');

        return csvHeader + csvRows;
    } catch (error) {
        console.error('Erro ao exportar participantes:', error);
        throw error;
    }
}

/**
 * Reembolsar ticket
 */
async function refundTicket(purchaseId, reason = 'admin_refund') {
    try {
        const purchase = await TicketPurchase.findById(purchaseId);
        if (!purchase) {
            throw new Error('Compra não encontrada');
        }

        if (purchase.status !== 'active') {
            throw new Error('Esta compra não pode ser reembolsada');
        }

        // Reembolsar $CASH
        await awardCash(purchase.userId, 'ticket_refund', purchase.totalPrice);

        // Remover role se foi atribuído
        if (purchase.roleAssigned) {
            try {
                const guild = client.guilds.cache.get(process.env.DISCORD_GUILD_ID);
                if (guild) {
                    const member = await guild.members.fetch(purchase.userId);
                    if (member && member.roles.cache.has(purchase.roleId)) {
                        await member.roles.remove(purchase.roleId);
                        console.log(`Role removido de ${purchase.username} durante reembolso`);
                    }
                }
            } catch (roleError) {
                console.error(`Erro ao remover role de ${purchase.username}:`, roleError);
            }
        }

        // Marcar como reembolsada
        purchase.status = 'refunded';
        purchase.refundReason = reason;
        purchase.refundDate = new Date();
        await purchase.save();

        // Atualizar contador do ticket
        const ticket = await Ticket.findById(purchase.ticketId);
        if (ticket) {
            ticket.soldTickets = Math.max(0, ticket.soldTickets - purchase.quantity);
            await ticket.save();
        }

        console.log(`Ticket reembolsado para ${purchase.username}: ${purchase.totalPrice} $CASH`);
        return purchase;

    } catch (error) {
        console.error('Erro ao reembolsar ticket:', error);
        throw error;
    }
}

/**
 * Verificar e marcar tickets expirados como pre-delete
 */
async function checkExpiredTickets() {
    try {
        const now = new Date();
        const expiredTickets = await Ticket.find({
            status: 'active',
            timeLimitDate: { $lt: now }
        });

        for (const ticket of expiredTickets) {
            console.log(`Ticket ${ticket.name} expirou, marcando como pre-delete`);
            await ticket.markAsPreDelete();
        }

        return expiredTickets.length;
    } catch (error) {
        console.error('Erro ao verificar tickets expirados:', error);
        throw error;
    }
}

/**
 * Remover roles de um ticket
 */
async function removeTicketRoles(ticketId, client) {
    try {
        const ticket = await Ticket.findById(ticketId);
        if (!ticket) {
            throw new Error('Ticket não encontrado');
        }

        const purchases = await TicketPurchase.find({
            ticketId: ticket._id,
            status: 'active'
        });

        let removedCount = 0;
        const guild = client.guilds.cache.get(process.env.DISCORD_GUILD_ID);

        if (guild) {
            for (const purchase of purchases) {
                try {
                    const member = await guild.members.fetch(purchase.userId);
                    if (member && member.roles.cache.has(ticket.roleId)) {
                        await member.roles.remove(ticket.roleId);
                        removedCount++;
                        console.log(`Role removido de ${purchase.username}`);
                    }
                } catch (error) {
                    console.error(`Erro ao remover role de ${purchase.username}:`, error);
                }
            }
        }

        console.log(`${removedCount} roles removidos do ticket ${ticket.name}`);
        return removedCount;

    } catch (error) {
        console.error('Erro ao remover roles do ticket:', error);
        throw error;
    }
}

module.exports = {
    createTicket,
    buyTickets,
    listActiveTickets,
    getTicketDetails,
    drawLottery,
    getParticipantsByRole,
    exportParticipantsList,
    refundTicket,
    checkExpiredTickets,
    removeTicketRoles
}; 