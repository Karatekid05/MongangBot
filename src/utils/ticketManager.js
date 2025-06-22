const Ticket = require('../models/Ticket');
const TicketPurchase = require('../models/TicketPurchase');
const User = require('../models/User');
const { awardCash, removeCash } = require('./pointsManager');

/**
 * Create a new ticket/event
 */
async function createTicket(ticketData) {
    try {
        const ticket = new Ticket(ticketData);
        await ticket.save();
        console.log(`Ticket created: ${ticket.name}`);
        return ticket;
    } catch (error) {
        console.error('Error creating ticket:', error);
        throw error;
    }
}

/**
 * Buy tickets
 */
async function buyTickets(ticketId, userId, username, quantity, client) {
    try {
        // Find the ticket
        const ticket = await Ticket.findById(ticketId);
        if (!ticket) {
            throw new Error('Ticket not found');
        }

        // Check if ticket is active
        if (ticket.status !== 'active') {
            throw new Error('Ticket is not available for purchase');
        }

        // Check if tickets are available
        if (!ticket.hasAvailableTickets()) {
            throw new Error('No tickets available');
        }

        // Check if there are enough tickets
        if (ticket.soldTickets + quantity > ticket.maxTickets) {
            throw new Error(`Only ${ticket.getAvailableTickets()} tickets available`);
        }

        // Check if user already bought the maximum allowed
        const userPurchases = await TicketPurchase.find({
            ticketId: ticket._id,
            userId: userId,
            status: 'active'
        });

        const totalUserTickets = userPurchases.reduce((sum, purchase) => sum + purchase.quantity, 0);
        if (totalUserTickets + quantity > ticket.settings.maxTicketsPerUser) {
            throw new Error(`You already bought ${totalUserTickets} tickets. Maximum allowed: ${ticket.settings.maxTicketsPerUser}`);
        }

        // Calculate total price
        const totalPrice = ticket.price * quantity;

        // Check if user has enough $CASH
        const user = await User.findOne({ userId });
        if (!user) {
            throw new Error('User not found in system');
        }

        if (user.cash < totalPrice) {
            throw new Error(`You need ${totalPrice} $CASH. You have: ${user.cash} $CASH`);
        }

        // Remove $CASH from user
        await removeCash(userId, 'ticket_purchase', totalPrice);

        // Create purchase record
        const purchase = new TicketPurchase({
            ticketId: ticket._id,
            userId: userId,
            username: username,
            quantity: quantity,
            totalPrice: totalPrice,
            roleId: ticket.roleId
        });

        // Generate ticket numbers (for lotteries)
        if (ticket.eventType === 'lottery') {
            const ticketNumbers = [];
            for (let i = 0; i < quantity; i++) {
                ticketNumbers.push(ticket.soldTickets + i + 1);
            }
            purchase.ticketNumbers = ticketNumbers;
        }

        await purchase.save();

        // Update sold tickets counter
        ticket.soldTickets += quantity;
        await ticket.save();

        // Assign role automatically if configured
        if (ticket.settings.autoAssignRole) {
            try {
                const guild = client.guilds.cache.get(process.env.DISCORD_GUILD_ID);
                if (guild) {
                    const member = await guild.members.fetch(userId);
                    if (member) {
                        await member.roles.add(ticket.roleId);
                        purchase.roleAssigned = true;
                        await purchase.save();
                        console.log(`Role ${ticket.roleName} assigned to ${username}`);
                    }
                }
            } catch (roleError) {
                console.error(`Error assigning role to ${username}:`, roleError);
            }
        }

        console.log(`${username} bought ${quantity} tickets for ${ticket.name} for ${totalPrice} $CASH`);
        return { ticket, purchase };

    } catch (error) {
        console.error('Error buying tickets:', error);
        throw error;
    }
}

/**
 * List all active tickets
 */
async function listActiveTickets() {
    try {
        const tickets = await Ticket.find({ status: 'active' }).sort({ createdAt: -1 });
        return tickets;
    } catch (error) {
        console.error('Error listing tickets:', error);
        throw error;
    }
}

/**
 * Get ticket details
 */
async function getTicketDetails(ticketId) {
    try {
        const ticket = await Ticket.findById(ticketId);
        if (!ticket) {
            throw new Error('Ticket not found');
        }

        // Find active purchases
        const purchases = await TicketPurchase.find({
            ticketId: ticket._id,
            status: 'active'
        });

        // Calculate statistics
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
        console.error('Error getting ticket details:', error);
        throw error;
    }
}

/**
 * Draw lottery
 */
async function drawLottery(ticketId, client) {
    try {
        const ticket = await Ticket.findById(ticketId);
        if (!ticket) {
            throw new Error('Ticket not found');
        }

        if (ticket.eventType !== 'lottery') {
            throw new Error('This ticket is not a lottery');
        }

        if (ticket.lottery.drawn) {
            throw new Error('Lottery has already been drawn');
        }

        // Find all participants
        const purchases = await TicketPurchase.find({
            ticketId: ticket._id,
            status: 'active'
        });

        if (purchases.length === 0) {
            throw new Error('No participants for the lottery');
        }

        // Create participants array for drawing
        const participants = [];
        purchases.forEach(purchase => {
            if (purchase.ticketNumbers) {
                // For lotteries with specific numbers
                purchase.ticketNumbers.forEach(ticketNumber => {
                    participants.push({
                        userId: purchase.userId,
                        username: purchase.username,
                        ticketNumber: ticketNumber
                    });
                });
            } else {
                // For simple lotteries
                participants.push({
                    userId: purchase.userId,
                    username: purchase.username
                });
            }
        });

        // Draw lottery
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

            // Give prize to winner
            if (prize > 0) {
                await awardCash(winner.userId, 'lottery_prize', prize);
                console.log(`${winner.username} won ${prize} $CASH in lottery ${ticket.name}`);
            }
        }

        // Update ticket with results
        ticket.lottery.winners = winners;
        ticket.lottery.drawn = true;
        ticket.lottery.drawDate = new Date();
        ticket.status = 'completed';
        await ticket.save();

        console.log(`Lottery ${ticket.name} drawn with ${winners.length} winners`);
        return { ticket, winners };

    } catch (error) {
        console.error('Error drawing lottery:', error);
        throw error;
    }
}

/**
 * Export participants by role
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
        console.error('Error finding participants by role:', error);
        throw error;
    }
}

/**
 * Export participants list for a specific ticket
 */
async function exportParticipantsList(ticketId) {
    try {
        const purchases = await TicketPurchase.find({
            ticketId: ticketId
        }).populate('ticketId');

        if (purchases.length === 0) {
            return 'No participants found for this ticket.';
        }

        const csvHeader = 'Username,User ID,Quantity,Total Price,Purchase Date,Ticket,Ticket Numbers\n';
        const csvRows = purchases.map(p => {
            const ticketNumbers = p.ticketNumbers ? p.ticketNumbers.join(';') : 'N/A';
            return `"${p.username}","${p.userId}",${p.quantity},${p.totalPrice},"${p.purchaseDate.toLocaleString('en-US')}","${p.ticketId.name}","${ticketNumbers}"`;
        }).join('\n');

        return csvHeader + csvRows;
    } catch (error) {
        console.error('Error exporting participants:', error);
        throw error;
    }
}

/**
 * Refund ticket
 */
async function refundTicket(purchaseId, reason = 'admin_refund') {
    try {
        const purchase = await TicketPurchase.findById(purchaseId);
        if (!purchase) {
            throw new Error('Purchase not found');
        }

        if (purchase.status !== 'active') {
            throw new Error('This purchase cannot be refunded');
        }

        // Refund $CASH
        await awardCash(purchase.userId, 'ticket_refund', purchase.totalPrice);

        // Remove role if assigned
        if (purchase.roleAssigned) {
            try {
                const guild = client.guilds.cache.get(process.env.DISCORD_GUILD_ID);
                if (guild) {
                    const member = await guild.members.fetch(purchase.userId);
                    if (member && member.roles.cache.has(purchase.roleId)) {
                        await member.roles.remove(purchase.roleId);
                        console.log(`Role removed from ${purchase.username} during refund`);
                    }
                }
            } catch (roleError) {
                console.error(`Error removing role from ${purchase.username}:`, roleError);
            }
        }

        // Mark as refunded
        purchase.status = 'refunded';
        purchase.refundReason = reason;
        purchase.refundDate = new Date();
        await purchase.save();

        // Update ticket counter
        const ticket = await Ticket.findById(purchase.ticketId);
        if (ticket) {
            ticket.soldTickets = Math.max(0, ticket.soldTickets - purchase.quantity);
            await ticket.save();
        }

        console.log(`Ticket refunded for ${purchase.username}: ${purchase.totalPrice} $CASH`);
        return purchase;

    } catch (error) {
        console.error('Error refunding ticket:', error);
        throw error;
    }
}

/**
 * Check and mark expired tickets as pre-delete
 */
async function checkExpiredTickets() {
    try {
        const now = new Date();
        const expiredTickets = await Ticket.find({
            status: 'active',
            timeLimitDate: { $lt: now }
        });

        for (const ticket of expiredTickets) {
            console.log(`Ticket ${ticket.name} expired, marking as pre-delete`);
            await ticket.markAsPreDelete();
        }

        return expiredTickets.length;
    } catch (error) {
        console.error('Error checking expired tickets:', error);
        throw error;
    }
}

/**
 * Remove roles from a ticket
 */
async function removeTicketRoles(ticketId, client) {
    try {
        const ticket = await Ticket.findById(ticketId);
        if (!ticket) {
            throw new Error('Ticket not found');
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
                        console.log(`Role removed from ${purchase.username}`);
                    }
                } catch (error) {
                    console.error(`Error removing role from ${purchase.username}:`, error);
                }
            }
        }

        console.log(`${removedCount} roles removed from ticket ${ticket.name}`);
        return removedCount;

    } catch (error) {
        console.error('Error removing ticket roles:', error);
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