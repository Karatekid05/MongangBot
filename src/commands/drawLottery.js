const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { drawLottery, getTicketDetails, listActiveTickets } = require('../utils/ticketManager');
const { isModerator } = require('../utils/permissions');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('drawlottery')
        .setDescription('Realizar sorteio de loteria (apenas moderadores)')
        .addStringOption(option =>
            option.setName('ticket_name')
                .setDescription('Nome do ticket de loteria')
                .setRequired(true)),

    async execute(interaction, client) {
        // Verificar se é moderador
        if (!isModerator(interaction.member)) {
            return interaction.reply({
                content: '❌ Apenas moderadores podem realizar sorteios.',
                ephemeral: true
            });
        }

        await interaction.deferReply();

        try {
            const ticketName = interaction.options.getString('ticket_name');

            // Buscar o ticket
            const activeTickets = await listActiveTickets();
            const ticket = activeTickets.find(t =>
                t.name.toLowerCase().includes(ticketName.toLowerCase()) &&
                t.eventType === 'lottery'
            );

            if (!ticket) {
                return interaction.editReply({
                    content: `❌ Ticket de loteria "${ticketName}" não encontrado.`
                });
            }

            // Verificar se já foi sorteado
            if (ticket.lottery.drawn) {
                const embed = new EmbedBuilder()
                    .setColor('#FF6B6B')
                    .setTitle('🎲 Sorteio Já Realizado')
                    .setDescription(`**${ticket.name}**`)
                    .addFields(
                        { name: '📅 Data do Sorteio', value: ticket.lottery.drawDate.toLocaleString('pt-BR'), inline: true },
                        { name: '🎫 Tickets Vendidos', value: ticket.soldTickets.toString(), inline: true },
                        { name: '💰 Prêmio Total', value: `${ticket.lottery.prizePool} $CASH`, inline: true }
                    );

                // Adicionar vencedores
                if (ticket.lottery.winners.length > 0) {
                    const winnersText = ticket.lottery.winners.map(winner =>
                        `${winner.position}º: **${winner.username}** - ${winner.prize} $CASH (Ticket #${winner.ticketNumber})`
                    ).join('\n');

                    embed.addFields({
                        name: '🏆 Vencedores',
                        value: winnersText,
                        inline: false
                    });
                }

                embed.setTimestamp();
                return interaction.editReply({ embeds: [embed] });
            }

            // Realizar sorteio
            const result = await drawLottery(ticket._id, client);

            // Criar embed com resultados
            const embed = new EmbedBuilder()
                .setColor('#FFD700')
                .setTitle('🎲 Sorteio Realizado!')
                .setDescription(`**${ticket.name}**`)
                .addFields(
                    { name: '📅 Data', value: new Date().toLocaleString('pt-BR'), inline: true },
                    { name: '🎫 Total de Tickets', value: ticket.soldTickets.toString(), inline: true },
                    { name: '💰 Prêmio Total', value: `${result.ticket.lottery.prizePool} $CASH`, inline: true },
                    { name: '👥 Participantes', value: result.ticket.lottery.winners.length.toString(), inline: true }
                );

            // Adicionar vencedores
            if (result.winners.length > 0) {
                const winnersText = result.winners.map(winner =>
                    `${winner.position}º: **${winner.username}** - ${winner.prize} $CASH (Ticket #${winner.ticketNumber})`
                ).join('\n');

                embed.addFields({
                    name: '🏆 Vencedores',
                    value: winnersText,
                    inline: false
                });
            } else {
                embed.addFields({
                    name: '🏆 Vencedores',
                    value: 'Nenhum vencedor selecionado',
                    inline: false
                });
            }

            embed.setFooter({ text: 'Parabéns aos vencedores! 🎉' })
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });

        } catch (error) {
            console.error('Erro ao realizar sorteio:', error);
            await interaction.editReply({
                content: `❌ Erro ao realizar sorteio: ${error.message}`
            });
        }
    }
}; 