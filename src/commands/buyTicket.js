const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { buyTickets, listActiveTickets } = require('../utils/ticketManager');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('buyticket')
        .setDescription('Buy tickets for events')
        .addStringOption(option =>
            option.setName('ticket_name')
                .setDescription('Ticket/event name (optional - shows list if not specified)')
                .setRequired(false)
                .setAutocomplete(true))
        .addIntegerOption(option =>
            option.setName('quantity')
                .setDescription('Number of tickets')
                .setMinValue(1)
                .setMaxValue(10)),

    async autocomplete(interaction) {
        const focusedValue = interaction.options.getFocused();
        const activeTickets = await listActiveTickets();
        const filtered = activeTickets.filter(choice => choice.name.toLowerCase().includes(focusedValue.toLowerCase()));

        await interaction.respond(
            filtered.map(choice => ({ name: choice.name, value: choice.name })),
        );
    },

    async execute(interaction, client) {
        await interaction.deferReply({ ephemeral: true });

        try {
            const ticketName = interaction.options.getString('ticket_name');
            const quantity = interaction.options.getInteger('quantity') || 1;
            const userId = interaction.user.id;
            const username = interaction.user.username;

            // Get active tickets
            const activeTickets = await listActiveTickets();

            if (activeTickets.length === 0) {
                const embed = new EmbedBuilder()
                    .setColor('#FF6B6B')
                    .setTitle('🎫 Available Tickets')
                    .setDescription('No tickets available at the moment.')
                    .setTimestamp();

                return interaction.editReply({ embeds: [embed] });
            }

            // If no name specified, show interactive list with buttons
            if (!ticketName) {
                const embed = new EmbedBuilder()
                    .setColor('#4ECDC4')
                    .setTitle('🎫 Available Tickets')
                    .setDescription('Click a button below to buy tickets:');

                // Add each ticket as a field
                activeTickets.forEach((ticket, index) => {
                    const availableTickets = ticket.getAvailableTickets();
                    const soldPercentage = ((ticket.soldTickets / ticket.maxTickets) * 100).toFixed(1);

                    const fieldValue = [
                        `💰 **Price:** ${ticket.price} $CASH`,
                        `🎫 **Available:** ${availableTickets}/${ticket.maxTickets} (${soldPercentage}% sold)`,
                        `👤 **Max per user:** ${ticket.settings.maxTicketsPerUser}`,
                        `🎮 **Type:** ${ticket.eventType.charAt(0).toUpperCase() + ticket.eventType.slice(1)}`,
                        `📅 **Created:** ${ticket.createdAt.toLocaleDateString('en-US')}`
                    ].join('\n');

                    embed.addFields({
                        name: `${index + 1}. ${ticket.name}`,
                        value: fieldValue,
                        inline: false
                    });
                });

                // Create buttons for each ticket
                const buttons = activeTickets.map((ticket, index) =>
                    new ButtonBuilder()
                        .setCustomId(`buy_ticket_${ticket._id}`)
                        .setLabel(`Buy ${ticket.name}`)
                        .setStyle(ButtonStyle.Primary)
                        .setEmoji('🎫')
                );

                // Split buttons into rows of 3
                const rows = [];
                for (let i = 0; i < buttons.length; i += 3) {
                    const row = new ActionRowBuilder().addComponents(buttons.slice(i, i + 3));
                    rows.push(row);
                }

                embed.setFooter({ text: 'Click a button to buy tickets' })
                    .setTimestamp();

                return interaction.editReply({
                    embeds: [embed],
                    components: rows
                });
            }

            // Find ticket by name (case insensitive)
            const ticket = activeTickets.find(t =>
                t.name.toLowerCase().includes(ticketName.toLowerCase())
            );

            if (!ticket) {
                // Show available tickets
                const availableTickets = activeTickets.map(t =>
                    `• **${t.name}** - ${t.price} $CASH (${t.getAvailableTickets()} available)`
                ).join('\n');

                const embed = new EmbedBuilder()
                    .setColor('#FF6B6B')
                    .setTitle('🎫 Available Tickets')
                    .setDescription(availableTickets)
                    .setFooter({ text: 'Use the exact ticket name to buy' });

                return interaction.editReply({
                    content: `❌ Ticket "${ticketName}" not found.`,
                    embeds: [embed]
                });
            }

            // Buy tickets
            const result = await buyTickets(ticket._id, userId, username, quantity, client);

            // Create confirmation embed
            const embed = new EmbedBuilder()
                .setColor('#00FF00')
                .setTitle('🎫 Purchase Successful!')
                .setDescription(`**${ticket.name}**`)
                .addFields(
                    { name: '👤 Buyer', value: username, inline: true },
                    { name: '🎫 Quantity', value: quantity.toString(), inline: true },
                    { name: '💰 Total Price', value: `${result.purchase.totalPrice} $CASH`, inline: true },
                    { name: '📅 Date', value: result.purchase.purchaseDate.toLocaleString('en-US'), inline: true },
                    { name: '🏷️ Role', value: ticket.roleName, inline: true },
                    { name: '🎮 Type', value: ticket.eventType.charAt(0).toUpperCase() + ticket.eventType.slice(1), inline: true }
                );

            // Add ticket numbers if lottery
            if (ticket.eventType === 'lottery' && result.purchase.ticketNumbers) {
                embed.addFields({
                    name: '🎲 Ticket Numbers',
                    value: result.purchase.ticketNumbers.join(', '),
                    inline: false
                });
            }

            // Add remaining tickets info
            const remainingTickets = ticket.getAvailableTickets();
            embed.addFields({
                name: '📊 Remaining Tickets',
                value: `${remainingTickets} of ${ticket.maxTickets}`,
                inline: false
            });

            embed.setFooter({ text: `Purchase ID: ${result.purchase._id}` })
                .setTimestamp();

            await interaction.editReply({
                content: '✅ Purchase completed successfully!',
                embeds: [embed]
            });

        } catch (error) {
            console.error('Error buying ticket:', error);
            await interaction.editReply({
                content: `❌ Error buying ticket: ${error.message}`
            });
        }
    }
}; 