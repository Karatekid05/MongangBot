const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { buyTickets, listActiveTickets } = require('../utils/ticketManager');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('buyticket')
        .setDescription('Comprar tickets para eventos')
        .addStringOption(option =>
            option.setName('ticket_name')
                .setDescription('Nome do ticket/evento (opcional - mostra lista se não especificado)')
                .setRequired(false))
        .addIntegerOption(option =>
            option.setName('quantity')
                .setDescription('Quantidade de tickets')
                .setMinValue(1)
                .setMaxValue(10)),

    async execute(interaction, client) {
        await interaction.deferReply({ ephemeral: true });

        try {
            const ticketName = interaction.options.getString('ticket_name');
            const quantity = interaction.options.getInteger('quantity') || 1;
            const userId = interaction.user.id;
            const username = interaction.user.username;

            // Buscar tickets ativos
            const activeTickets = await listActiveTickets();

            if (activeTickets.length === 0) {
                const embed = new EmbedBuilder()
                    .setColor('#FF6B6B')
                    .setTitle('🎫 Tickets Disponíveis')
                    .setDescription('Não há tickets disponíveis no momento.')
                    .setTimestamp();

                return interaction.editReply({ embeds: [embed] });
            }

            // Se não especificou nome, mostrar lista
            if (!ticketName) {
                const embed = new EmbedBuilder()
                    .setColor('#4ECDC4')
                    .setTitle('🎫 Tickets Disponíveis')
                    .setDescription('Escolha um ticket para comprar:');

                // Adicionar cada ticket como um campo
                activeTickets.forEach((ticket, index) => {
                    const availableTickets = ticket.getAvailableTickets();
                    const soldPercentage = ((ticket.soldTickets / ticket.maxTickets) * 100).toFixed(1);

                    const fieldValue = [
                        `💰 **Preço:** ${ticket.price} $CASH`,
                        `🎫 **Disponíveis:** ${availableTickets}/${ticket.maxTickets} (${soldPercentage}% vendidos)`,
                        `👤 **Máximo por usuário:** ${ticket.settings.maxTicketsPerUser}`,
                        `🎮 **Tipo:** ${ticket.eventType.charAt(0).toUpperCase() + ticket.eventType.slice(1)}`,
                        `📅 **Criado:** ${ticket.createdAt.toLocaleDateString('pt-BR')}`
                    ].join('\n');

                    embed.addFields({
                        name: `${index + 1}. ${ticket.name}`,
                        value: fieldValue,
                        inline: false
                    });
                });

                embed.setFooter({ text: 'Use /buyticket ticket_name:"Nome do Ticket" quantity:1 para comprar' })
                    .setTimestamp();

                return interaction.editReply({ embeds: [embed] });
            }

            // Encontrar o ticket pelo nome (case insensitive)
            const ticket = activeTickets.find(t =>
                t.name.toLowerCase().includes(ticketName.toLowerCase())
            );

            if (!ticket) {
                // Mostrar tickets disponíveis
                const availableTickets = activeTickets.map(t =>
                    `• **${t.name}** - ${t.price} $CASH (${t.getAvailableTickets()} disponíveis)`
                ).join('\n');

                const embed = new EmbedBuilder()
                    .setColor('#FF6B6B')
                    .setTitle('🎫 Tickets Disponíveis')
                    .setDescription(availableTickets)
                    .setFooter({ text: 'Use o nome exato do ticket para comprar' });

                return interaction.editReply({
                    content: `❌ Ticket "${ticketName}" não encontrado.`,
                    embeds: [embed]
                });
            }

            // Comprar tickets
            const result = await buyTickets(ticket._id, userId, username, quantity, client);

            // Criar embed de confirmação
            const embed = new EmbedBuilder()
                .setColor('#00FF00')
                .setTitle('🎫 Compra Realizada com Sucesso!')
                .setDescription(`**${ticket.name}**`)
                .addFields(
                    { name: '👤 Comprador', value: username, inline: true },
                    { name: '🎫 Quantidade', value: quantity.toString(), inline: true },
                    { name: '💰 Preço Total', value: `${result.purchase.totalPrice} $CASH`, inline: true },
                    { name: '📅 Data', value: result.purchase.purchaseDate.toLocaleString('pt-BR'), inline: true },
                    { name: '🏷️ Role', value: ticket.roleName, inline: true },
                    { name: '🎮 Tipo', value: ticket.eventType.charAt(0).toUpperCase() + ticket.eventType.slice(1), inline: true }
                );

            // Adicionar números dos tickets se for loteria
            if (ticket.eventType === 'lottery' && result.purchase.ticketNumbers) {
                embed.addFields({
                    name: '🎲 Números dos Tickets',
                    value: result.purchase.ticketNumbers.join(', '),
                    inline: false
                });
            }

            // Adicionar informações sobre tickets restantes
            const remainingTickets = ticket.getAvailableTickets();
            embed.addFields({
                name: '📊 Tickets Restantes',
                value: `${remainingTickets} de ${ticket.maxTickets}`,
                inline: false
            });

            embed.setFooter({ text: `ID da compra: ${result.purchase._id}` })
                .setTimestamp();

            await interaction.editReply({
                content: '✅ Compra realizada com sucesso!',
                embeds: [embed]
            });

        } catch (error) {
            console.error('Erro ao comprar ticket:', error);
            await interaction.editReply({
                content: `❌ Erro ao comprar ticket: ${error.message}`
            });
        }
    }
}; 