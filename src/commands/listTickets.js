const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { listActiveTickets } = require('../utils/ticketManager');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('tickets')
        .setDescription('List available tickets/events'),

    async execute(interaction, client) {
        await interaction.deferReply();

        try {
            const tickets = await listActiveTickets();

            if (tickets.length === 0) {
                const embed = new EmbedBuilder()
                    .setColor('#FF6B6B')
                    .setTitle('🎫 Available Tickets')
                    .setDescription('No tickets available at the moment.')
                    .setTimestamp();

                return interaction.editReply({ embeds: [embed] });
            }

            const embed = new EmbedBuilder()
                .setColor('#4ECDC4')
                .setTitle('🎫 Available Tickets')
                .setDescription(`**${tickets.length}** active tickets`);

            // Add each ticket as a field
            tickets.forEach((ticket, index) => {
                const status = ticket.status === 'active' ? '🟢' : '🔴';
                const availableTickets = ticket.getAvailableTickets();
                const soldPercentage = ((ticket.soldTickets / ticket.maxTickets) * 100).toFixed(1);

                const fieldValue = [
                    `📝 **${ticket.description}**`,
                    `💰 **Price:** ${ticket.price} $CASH`,
                    `🎫 **Available:** ${availableTickets}/${ticket.maxTickets} (${soldPercentage}% sold)`,
                    `👤 **Max per user:** ${ticket.settings.maxTicketsPerUser}`,
                    `🏷️ **Role:** ${ticket.roleName}`,
                    `🎮 **Type:** ${ticket.eventType.charAt(0).toUpperCase() + ticket.eventType.slice(1)}`,
                    `📅 **Created:** ${ticket.createdAt.toLocaleDateString('en-US')}`
                ];

                // Add time limit if exists
                if (ticket.timeLimitDate) {
                    const timeLeft = ticket.timeLimitDate - new Date();
                    if (timeLeft > 0) {
                        const hours = Math.floor(timeLeft / (1000 * 60 * 60));
                        const minutes = Math.floor((timeLeft % (1000 * 60 * 60)) / (1000 * 60));
                        fieldValue.push(`⏰ **Expires in:** ${hours}h ${minutes}m`);
                    } else {
                        fieldValue.push(`⏰ **Expired:** ${ticket.timeLimitDate.toLocaleString('en-US')}`);
                    }
                }

                // Add prize for lotteries
                if (ticket.eventType === 'lottery' && ticket.lottery) {
                    fieldValue.push(`🎲 **Prize:** ${ticket.lottery.prizePool} $CASH`);
                }

                embed.addFields({
                    name: `${status} ${ticket.name}`,
                    value: fieldValue.join('\n'),
                    inline: false
                });
            });

            embed.setFooter({ text: 'Use /buyticket <name> to buy' })
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });

        } catch (error) {
            console.error('Error listing tickets:', error);
            await interaction.editReply({
                content: `❌ Error listing tickets: ${error.message}`
            });
        }
    }
}; 