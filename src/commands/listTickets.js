const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { listActiveTickets } = require('../utils/ticketManager');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('tickets')
        .setDescription('Listar tickets/eventos disponíveis'),

    async execute(interaction, client) {
        await interaction.deferReply();

        try {
            const tickets = await listActiveTickets();

            if (tickets.length === 0) {
                const embed = new EmbedBuilder()
                    .setColor('#FF6B6B')
                    .setTitle('🎫 Tickets Disponíveis')
                    .setDescription('Não há tickets disponíveis no momento.')
                    .setTimestamp();

                return interaction.editReply({ embeds: [embed] });
            }

            const embed = new EmbedBuilder()
                .setColor('#4ECDC4')
                .setTitle('🎫 Tickets Disponíveis')
                .setDescription(`**${tickets.length}** tickets ativos`);

            // Adicionar cada ticket como um campo
            tickets.forEach((ticket, index) => {
                const status = ticket.status === 'active' ? '🟢' : '🔴';
                const availableTickets = ticket.getAvailableTickets();
                const soldPercentage = ((ticket.soldTickets / ticket.maxTickets) * 100).toFixed(1);

                const fieldValue = [
                    `📝 **${ticket.description}**`,
                    `💰 **Preço:** ${ticket.price} $CASH`,
                    `🎫 **Disponíveis:** ${availableTickets}/${ticket.maxTickets} (${soldPercentage}% vendidos)`,
                    `👤 **Máximo por usuário:** ${ticket.settings.maxTicketsPerUser}`,
                    `🏷️ **Role:** ${ticket.roleName}`,
                    `🎮 **Tipo:** ${ticket.eventType.charAt(0).toUpperCase() + ticket.eventType.slice(1)}`,
                    `📅 **Criado:** ${ticket.createdAt.toLocaleDateString('pt-BR')}`
                ];

                // Adicionar data limite se existir
                if (ticket.timeLimitDate) {
                    const timeLeft = ticket.timeLimitDate - new Date();
                    if (timeLeft > 0) {
                        const hours = Math.floor(timeLeft / (1000 * 60 * 60));
                        const minutes = Math.floor((timeLeft % (1000 * 60 * 60)) / (1000 * 60));
                        fieldValue.push(`⏰ **Expira em:** ${hours}h ${minutes}m`);
                    } else {
                        fieldValue.push(`⏰ **Expirado:** ${ticket.timeLimitDate.toLocaleString('pt-BR')}`);
                    }
                }

                // Adicionar prêmio para loterias
                if (ticket.eventType === 'lottery' && ticket.lottery) {
                    fieldValue.push(`🎲 **Prêmio:** ${ticket.lottery.prizePool} $CASH`);
                }

                embed.addFields({
                    name: `${status} ${ticket.name}`,
                    value: fieldValue.join('\n'),
                    inline: false
                });
            });

            embed.setFooter({ text: 'Use /buyticket <nome> para comprar' })
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });

        } catch (error) {
            console.error('Erro ao listar tickets:', error);
            await interaction.editReply({
                content: `❌ Erro ao listar tickets: ${error.message}`
            });
        }
    }
}; 