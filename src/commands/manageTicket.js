const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const Ticket = require('../models/Ticket');
const TicketPurchase = require('../models/TicketPurchase');
const { isModerator } = require('../utils/permissions');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('manageticket')
        .setDescription('Gerenciar tickets/eventos (apenas moderadores)')
        .addStringOption(option =>
            option.setName('ticket_name')
                .setDescription('Nome do ticket/evento')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('action')
                .setDescription('Ação a ser executada')
                .addChoices(
                    { name: 'Ver Detalhes', value: 'details' },
                    { name: 'Pausar', value: 'pause' },
                    { name: 'Ativar', value: 'activate' },
                    { name: 'Completar', value: 'complete' },
                    { name: 'Cancelar', value: 'cancel' },
                    { name: '🗑️ Deletar (Irreversível)', value: 'delete' },
                    { name: '💰 Cancelar e Reembolsar', value: 'refund' }
                )
                .setRequired(true))
        .addBooleanOption(option =>
            option.setName('confirm')
                .setDescription('Confirmar ação (necessário para delete/refund)'))
        .addBooleanOption(option =>
            option.setName('remove_roles')
                .setDescription('Remover roles dos participantes (para delete/refund)')),

    async execute(interaction, client) {
        // Verificar se é moderador
        if (!isModerator(interaction.member)) {
            return interaction.reply({
                content: '❌ Apenas moderadores podem gerenciar tickets.',
                ephemeral: true
            });
        }

        await interaction.deferReply({ ephemeral: true });

        try {
            const ticketName = interaction.options.getString('ticket_name');
            const action = interaction.options.getString('action');
            const confirm = interaction.options.getBoolean('confirm') || false;
            const removeRoles = interaction.options.getBoolean('remove_roles') !== false; // Default true

            // Buscar o ticket
            const ticket = await Ticket.findOne({
                name: { $regex: ticketName, $options: 'i' }
            });

            if (!ticket) {
                return interaction.editReply({
                    content: `❌ Ticket "${ticketName}" not found.`
                });
            }

            if (action === 'details') {
                // Mostrar detalhes do ticket
                const embed = new EmbedBuilder()
                    .setColor('#4ECDC4')
                    .setTitle('🎫 Detalhes do Ticket')
                    .setDescription(`**${ticket.name}**`)
                    .addFields(
                        { name: '📝 Descrição', value: ticket.description, inline: false },
                        { name: '💰 Preço', value: `${ticket.price} $CASH`, inline: true },
                        { name: '🎫 Vendidos/Total', value: `${ticket.soldTickets}/${ticket.maxTickets}`, inline: true },
                        { name: '📊 Disponíveis', value: ticket.getAvailableTickets().toString(), inline: true },
                        { name: '🏷️ Role', value: ticket.roleName, inline: true },
                        { name: '🎮 Tipo', value: ticket.eventType.charAt(0).toUpperCase() + ticket.eventType.slice(1), inline: true },
                        { name: '📈 Status', value: ticket.status.charAt(0).toUpperCase() + ticket.status.slice(1), inline: true },
                        { name: '💰 Receita Total', value: `${ticket.getTotalRevenue()} $CASH`, inline: true },
                        { name: '👤 Máximo por Usuário', value: ticket.settings.maxTicketsPerUser.toString(), inline: true },
                        { name: '⚙️ Auto-assign Role', value: ticket.settings.autoAssignRole ? 'Sim' : 'Não', inline: true },
                        { name: '📅 Criado em', value: ticket.createdAt.toLocaleString('pt-BR'), inline: true },
                        { name: '📅 Última Atualização', value: ticket.updatedAt.toLocaleString('pt-BR'), inline: true }
                    );

                if (ticket.timeLimitDate) {
                    embed.addFields({
                        name: '⏰ Data Limite',
                        value: ticket.timeLimitDate.toLocaleString('pt-BR'),
                        inline: true
                    });
                }

                // Adicionar informações específicas por tipo
                if (ticket.eventType === 'lottery' && ticket.lottery) {
                    embed.addFields({
                        name: '🎲 Informações da Loteria',
                        value: [
                            `💰 Prêmio: ${ticket.lottery.prizePool} $CASH`,
                            `🎲 Sorteado: ${ticket.lottery.drawn ? 'Sim' : 'Não'}`,
                            ticket.lottery.drawDate ? `📅 Data do Sorteio: ${ticket.lottery.drawDate.toLocaleString('pt-BR')}` : ''
                        ].filter(Boolean).join('\n'),
                        inline: false
                    });
                }

                embed.setFooter({ text: `ID: ${ticket._id}` })
                    .setTimestamp();

                return interaction.editReply({ embeds: [embed] });
            }

            // Ações de delete/refund
            if (action === 'delete' || action === 'refund') {
                // Buscar compras ativas
                const activePurchases = await TicketPurchase.find({
                    ticketId: ticket._id,
                    status: 'active'
                });

                // Se não confirmou, mostrar aviso
                if (!confirm) {
                    const embed = new EmbedBuilder()
                        .setColor('#FF6B6B')
                        .setTitle('⚠️ Confirmação Necessária')
                        .setDescription(`**${ticket.name}**`)
                        .addFields(
                            { name: '🎫 Tickets Vendidos', value: `${ticket.soldTickets}/${ticket.maxTickets}`, inline: true },
                            { name: '💰 Receita Total', value: `${ticket.getTotalRevenue()} $CASH`, inline: true },
                            { name: '👥 Participantes Ativos', value: activePurchases.length.toString(), inline: true },
                            { name: '🎮 Tipo', value: ticket.eventType.charAt(0).toUpperCase() + ticket.eventType.slice(1), inline: true },
                            { name: '📈 Status', value: ticket.status.charAt(0).toUpperCase() + ticket.status.slice(1), inline: true },
                            { name: '📅 Criado em', value: ticket.createdAt.toLocaleString('pt-BR'), inline: true }
                        );

                    if (action === 'delete') {
                        embed.addFields({
                            name: '🗑️ Ação: Deletar Completamente',
                            value: '⚠️ **ATENÇÃO:** Esta ação é irreversível!\n\n' +
                                '• Ticket será removido permanentemente\n' +
                                '• Todas as compras serão deletadas\n' +
                                '• Histórico será perdido\n' +
                                '• Roles serão removidos (se configurado)',
                            inline: false
                        });
                    } else if (action === 'refund') {
                        embed.addFields({
                            name: '💰 Ação: Cancelar e Reembolsar',
                            value: '✅ **SEGURO:** Esta ação reembolsa os usuários!\n\n' +
                                '• Ticket será cancelado\n' +
                                '• Todos receberão reembolso\n' +
                                '• Roles serão removidos\n' +
                                '• Histórico será mantido',
                            inline: false
                        });
                    }

                    embed.setFooter({ text: 'Use confirm:true para executar a ação' })
                        .setTimestamp();

                    return interaction.editReply({
                        content: '⚠️ Confirmação necessária para deletar ticket!',
                        embeds: [embed]
                    });
                }

                // Executar ação confirmada
                let resultMessage = '';
                let embedColor = '#00FF00';

                if (action === 'delete') {
                    // Deletar completamente
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

                    // Deletar todas as compras
                    await TicketPurchase.deleteMany({ ticketId: ticket._id });

                    // Deletar o ticket
                    await Ticket.deleteOne({ _id: ticket._id });

                    resultMessage = `🗑️ Ticket "${ticket.name}" deletado completamente!`;
                    embedColor = '#FF0000';

                } else if (action === 'refund') {
                    // Cancelar e reembolsar
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

                    // Remover roles se configurado
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

                    // Marcar compras como reembolsadas
                    await TicketPurchase.updateMany(
                        { ticketId: ticket._id, status: 'active' },
                        { status: 'refunded' }
                    );

                    // Cancelar ticket
                    ticket.status = 'cancelled';
                    await ticket.save();

                    resultMessage = `💰 Ticket "${ticket.name}" cancelado e ${refundedCount} usuários reembolsados!`;
                    embedColor = '#FFA500';
                }

                const embed = new EmbedBuilder()
                    .setColor(embedColor)
                    .setTitle('✅ Ação Executada')
                    .setDescription(`**${ticket.name}**`)
                    .addFields(
                        { name: '👤 Moderador', value: interaction.user.username, inline: true },
                        { name: '📅 Data', value: new Date().toLocaleString('pt-BR'), inline: true },
                        { name: '🗑️ Roles Removidos', value: removeRoles ? 'Sim' : 'Não', inline: true }
                    );

                if (action === 'refund') {
                    embed.addFields({
                        name: '💰 Reembolsos',
                        value: `${activePurchases.length} usuários reembolsados`,
                        inline: false
                    });
                }

                embed.setFooter({ text: `ID: ${ticket._id}` })
                    .setTimestamp();

                await interaction.editReply({
                    content: resultMessage,
                    embeds: [embed]
                });

                return;
            }

            // Executar ação normal
            let newStatus;
            let actionText;

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
                    return interaction.editReply({
                        content: '❌ Ação inválida.'
                    });
            }

            // Verificar se a mudança é válida
            if (ticket.status === newStatus) {
                return interaction.editReply({
                    content: `❌ O ticket já está ${actionText}.`
                });
            }

            // Atualizar status
            ticket.status = newStatus;
            await ticket.save();

            const embed = new EmbedBuilder()
                .setColor('#00FF00')
                .setTitle('✅ Ticket Atualizado')
                .setDescription(`**${ticket.name}**`)
                .addFields(
                    { name: '🔄 Status Anterior', value: ticket.status.charAt(0).toUpperCase() + ticket.status.slice(1), inline: true },
                    { name: '✅ Novo Status', value: newStatus.charAt(0).toUpperCase() + newStatus.slice(1), inline: true },
                    { name: '👤 Moderador', value: interaction.user.username, inline: true },
                    { name: '📅 Data', value: new Date().toLocaleString('pt-BR'), inline: true }
                )
                .setFooter({ text: `ID: ${ticket._id}` })
                .setTimestamp();

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