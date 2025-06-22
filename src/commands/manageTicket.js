const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const Ticket = require('../models/Ticket');
const TicketPurchase = require('../models/TicketPurchase');
const { isModerator } = require('../utils/permissions');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('manageticket')
        .setDescription('Manage tickets/events (moderators only)')
        .addStringOption(option =>
            option.setName('ticket_name')
                .setDescription('Name of the ticket/event')
                .setRequired(true)
                .setAutocomplete(true))
        .addStringOption(option =>
            option.setName('action')
                .setDescription('Action to perform')
                .addChoices(
                    { name: 'View Details', value: 'details' },
                    { name: 'Pause', value: 'pause' },
                    { name: 'Activate', value: 'activate' },
                    { name: 'Complete', value: 'complete' },
                    { name: 'Cancel', value: 'cancel' },
                    { name: '🗑️ Delete (Irreversible)', value: 'delete' },
                    { name: '💰 Cancel & Refund', value: 'refund' }
                )
                .setRequired(true))
        .addBooleanOption(option =>
            option.setName('confirm')
                .setDescription('Confirm action (required for delete/refund)'))
        .addBooleanOption(option =>
            option.setName('remove_roles')
                .setDescription('Remove roles from participants (for delete/refund)')),

    async autocomplete(interaction) {
        const focusedValue = interaction.options.getFocused();
        const tickets = await Ticket.find({
            status: { $in: ['active', 'paused', 'pre-delete', 'completed'] },
            name: { $regex: focusedValue, $options: 'i' }
        }).limit(25);

        await interaction.respond(
            tickets.map(ticket => ({ name: `[${ticket.status.toUpperCase()}] ${ticket.name}`, value: ticket.name })),
        );
    },

    async execute(interaction, client) {
        if (!isModerator(interaction.member)) {
            return interaction.reply({
                content: '❌ Only moderators can manage tickets.',
                ephemeral: true
            });
        }

        await interaction.deferReply({ ephemeral: true });

        try {
            const ticketName = interaction.options.getString('ticket_name');
            const action = interaction.options.getString('action');
            const confirm = interaction.options.getBoolean('confirm') || false;
            const removeRoles = interaction.options.getBoolean('remove_roles') !== false;

            const ticket = await Ticket.findOne({ name: ticketName });

            if (!ticket) {
                return interaction.editReply({
                    content: `❌ Ticket "${ticketName}" not found.`
                });
            }

            if (action === 'details') {
                const embed = new EmbedBuilder()
                    .setColor('#4ECDC4')
                    .setTitle('🎫 Ticket Details')
                    .setDescription(`**${ticket.name}**`)
                    .addFields(
                        { name: '📝 Description', value: ticket.description, inline: false },
                        { name: '💰 Price', value: `${ticket.price} $CASH`, inline: true },
                        { name: '🎫 Sold/Total', value: `${ticket.soldTickets}/${ticket.maxTickets}`, inline: true },
                        { name: '📊 Available', value: ticket.getAvailableTickets().toString(), inline: true },
                        { name: '🏷️ Role', value: ticket.roleName, inline: true },
                        { name: '🎮 Type', value: ticket.eventType.charAt(0).toUpperCase() + ticket.eventType.slice(1), inline: true },
                        { name: '📈 Status', value: ticket.status.charAt(0).toUpperCase() + ticket.status.slice(1), inline: true },
                        { name: '💰 Total Revenue', value: `${ticket.getTotalRevenue()} $CASH`, inline: true },
                        { name: '👤 Max Per User', value: ticket.settings.maxTicketsPerUser.toString(), inline: true },
                        { name: '⚙️ Auto-assign Role', value: ticket.settings.autoAssignRole ? 'Yes' : 'No', inline: true },
                        { name: '📅 Created At', value: ticket.createdAt.toLocaleString('en-US'), inline: true },
                        { name: '📅 Last Updated', value: ticket.updatedAt.toLocaleString('en-US'), inline: true }
                    );

                if (ticket.timeLimitDate) {
                    embed.addFields({
                        name: '⏰ Time Limit',
                        value: ticket.timeLimitDate.toLocaleString('en-US'),
                        inline: true
                    });
                }

                if (ticket.eventType === 'lottery' && ticket.lottery) {
                    embed.addFields({
                        name: '🎲 Lottery Info',
                        value: [
                            `💰 Prize: ${ticket.lottery.prizePool} $CASH`,
                            `🎲 Drawn: ${ticket.lottery.drawn ? 'Yes' : 'No'}`,
                            ticket.lottery.drawDate ? `📅 Draw Date: ${ticket.lottery.drawDate.toLocaleString('en-US')}` : ''
                        ].filter(Boolean).join('\n'),
                        inline: false
                    });
                }

                embed.setFooter({ text: `ID: ${ticket._id}` })
                    .setTimestamp();

                return interaction.editReply({ embeds: [embed] });
            }

            if (action === 'delete' || action === 'refund') {
                const activePurchases = await TicketPurchase.find({
                    ticketId: ticket._id,
                    status: 'active'
                });

                if (!confirm) {
                    const embed = new EmbedBuilder()
                        .setColor('#FF6B6B')
                        .setTitle('⚠️ Confirmation Required')
                        .setDescription(`**${ticket.name}**`)
                        .addFields(
                            { name: '🎫 Tickets Sold', value: `${ticket.soldTickets}/${ticket.maxTickets}`, inline: true },
                            { name: '💰 Total Revenue', value: `${ticket.getTotalRevenue()} $CASH`, inline: true },
                            { name: '👥 Active Participants', value: activePurchases.length.toString(), inline: true },
                            { name: '🎮 Type', value: ticket.eventType.charAt(0).toUpperCase() + ticket.eventType.slice(1), inline: true },
                            { name: '📈 Status', value: ticket.status.charAt(0).toUpperCase() + ticket.status.slice(1), inline: true },
                            { name: '📅 Created At', value: ticket.createdAt.toLocaleString('en-US'), inline: true }
                        );

                    if (action === 'delete') {
                        embed.addFields({
                            name: '🗑️ Action: Delete Completely',
                            value: '⚠️ **WARNING:** This action is irreversible!\n\n' +
                                '• Ticket will be permanently removed\n' +
                                '• All purchases will be deleted\n' +
                                '• History will be lost\n' +
                                '• Roles will be removed (if configured)',
                            inline: false
                        });
                    } else if (action === 'refund') {
                        embed.addFields({
                            name: '💰 Action: Cancel & Refund',
                            value: '✅ **SAFE:** This action refunds users!\n\n' +
                                '• Ticket will be cancelled\n' +
                                '• Everyone will be refunded\n' +
                                '• Roles will be removed\n' +
                                '• History will be kept',
                            inline: false
                        });
                    }

                    embed.setFooter({ text: 'Use confirm:true to execute this action' })
                        .setTimestamp();

                    return interaction.editReply({
                        content: '⚠️ Confirmation required to manage this ticket!',
                        embeds: [embed]
                    });
                }

                let resultMessage = '';
                let embedColor = '#00FF00';

                if (action === 'delete') {
                    if (removeRoles) {
                        const guild = client.guilds.cache.get(process.env.DISCORD_GUILD_ID);
                        if (guild) {
                            for (const purchase of activePurchases) {
                                try {
                                    const member = await guild.members.fetch(purchase.userId);
                                    if (member && member.roles.cache.has(ticket.roleId)) {
                                        await member.roles.remove(ticket.roleId);
                                        console.log(`Role removed from ${purchase.username} during delete`);
                                    }
                                } catch (error) {
                                    console.error(`Error removing role from ${purchase.username}:`, error);
                                }
                            }
                        }
                    }
                    await TicketPurchase.deleteMany({ ticketId: ticket._id });
                    await Ticket.deleteOne({ _id: ticket._id });
                    resultMessage = `🗑️ Ticket "${ticket.name}" has been permanently deleted!`;
                    embedColor = '#FF0000';

                } else if (action === 'refund') {
                    const { awardCash } = require('../utils/pointsManager');

                    let refundedCount = 0;
                    for (const purchase of activePurchases) {
                        try {
                            await awardCash(purchase.userId, 'ticket_refund', purchase.totalPrice);
                            refundedCount++;
                        } catch (error) {
                            console.error(`Error reimbursing ${purchase.username}:`, error);
                        }
                    }

                    if (removeRoles) {
                        const guild = client.guilds.cache.get(process.env.DISCORD_GUILD_ID);
                        if (guild) {
                            for (const purchase of activePurchases) {
                                try {
                                    const member = await guild.members.fetch(purchase.userId);
                                    if (member && member.roles.cache.has(ticket.roleId)) {
                                        await member.roles.remove(ticket.roleId);
                                    }
                                } catch (error) {
                                    console.error(`Error removing role from ${purchase.username}:`, error);
                                }
                            }
                        }
                    }

                    await TicketPurchase.updateMany(
                        { ticketId: ticket._id, status: 'active' },
                        { status: 'refunded' }
                    );

                    ticket.status = 'cancelled';
                    await ticket.save();

                    resultMessage = `💰 Ticket "${ticket.name}" has been cancelled and ${refundedCount} users refunded!`;
                    embedColor = '#FFA500';
                }

                const embed = new EmbedBuilder()
                    .setColor(embedColor)
                    .setTitle('✅ Action Executed')
                    .setDescription(`**${ticket.name}**`)
                    .addFields(
                        { name: '👤 Moderator', value: interaction.user.username, inline: true },
                        { name: '📅 Date', value: new Date().toLocaleString('en-US'), inline: true },
                        { name: '🗑️ Roles Removed', value: removeRoles ? 'Yes' : 'No', inline: true }
                    );

                return interaction.editReply({
                    content: resultMessage,
                    embeds: [embed]
                });
            }

            let newStatus;
            let actionText = '';
            switch (action) {
                case 'pause':
                    newStatus = 'paused';
                    actionText = 'paused';
                    break;
                case 'activate':
                    newStatus = 'active';
                    actionText = 'activated';
                    break;
                case 'cancel':
                    newStatus = 'cancelled';
                    actionText = 'canceled';
                    break;
                case 'complete':
                    newStatus = 'completed';
                    actionText = 'completed';
                    break;
                default:
                    return interaction.editReply({ content: '❌ Invalid action.' });
            }

            ticket.status = newStatus;
            await ticket.save();

            const embed = new EmbedBuilder()
                .setColor('#00FF00')
                .setTitle('✅ Ticket Status Updated')
                .setDescription(`Ticket **${ticket.name}** is now **${newStatus}**.`)
                .addFields(
                    { name: '👤 Moderator', value: interaction.user.username, inline: true },
                    { name: '📅 Date', value: new Date().toLocaleString('en-US'), inline: true }
                );

            await interaction.editReply({
                content: `✅ Ticket ${actionText} successfully!`,
                embeds: [embed]
            });

        } catch (error) {
            console.error('Error managing ticket:', error);
            await interaction.editReply({
                content: `❌ Error managing ticket: ${error.message}`
            });
        }
    }
}; 