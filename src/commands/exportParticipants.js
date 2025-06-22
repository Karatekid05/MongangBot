const { SlashCommandBuilder, EmbedBuilder, AttachmentBuilder } = require('discord.js');
const { getParticipantsByRole, exportParticipantsList, getTicketDetails } = require('../utils/ticketManager');
const { isModerator } = require('../utils/permissions');
const TicketPurchase = require('../models/TicketPurchase');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('exportparticipants')
        .setDescription('Exportar lista de participantes (apenas moderadores)')
        .addStringOption(option =>
            option.setName('type')
                .setDescription('Tipo de exportação')
                .addChoices(
                    { name: 'Por Role', value: 'role' },
                    { name: 'Por Ticket', value: 'ticket' }
                )
                .setRequired(true))
        .addStringOption(option =>
            option.setName('identifier')
                .setDescription('ID do role ou nome do ticket')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('format')
                .setDescription('Formato de exportação')
                .addChoices(
                    { name: 'CSV', value: 'csv' },
                    { name: 'Lista Simples', value: 'list' }
                )
                .setRequired(true)),

    async execute(interaction, client) {
        // Verificar se é moderador
        if (!isModerator(interaction.member)) {
            return interaction.reply({
                content: '❌ Apenas moderadores podem exportar listas de participantes.',
                ephemeral: true
            });
        }

        await interaction.deferReply({ ephemeral: true });

        try {
            const type = interaction.options.getString('type');
            const identifier = interaction.options.getString('identifier');
            const format = interaction.options.getString('format');

            let participants = [];
            let title = '';
            let description = '';

            if (type === 'role') {
                // Exportar por role
                const guild = interaction.guild;
                const role = guild.roles.cache.get(identifier);
                if (!role) {
                    return interaction.editReply({
                        content: `❌ Role com ID ${identifier} não encontrado no servidor.`
                    });
                }

                participants = await getParticipantsByRole(identifier);
                title = '📊 Lista de Participantes por Role';
                description = `**${role.name}**`;

            } else if (type === 'ticket') {
                // Exportar por ticket específico
                const purchases = await TicketPurchase.find({
                    status: 'active'
                }).populate('ticketId');

                const ticketPurchases = purchases.filter(p =>
                    p.ticketId && p.ticketId.name.toLowerCase().includes(identifier.toLowerCase())
                );

                if (ticketPurchases.length === 0) {
                    return interaction.editReply({
                        content: `❌ Nenhum ticket encontrado com nome "${identifier}".`
                    });
                }

                // Agrupar por ticket
                const ticketMap = new Map();
                ticketPurchases.forEach(purchase => {
                    const ticketName = purchase.ticketId.name;
                    if (!ticketMap.has(ticketName)) {
                        ticketMap.set(ticketName, []);
                    }
                    ticketMap.get(ticketName).push(purchase);
                });

                // Se encontrou múltiplos tickets, mostrar opções
                if (ticketMap.size > 1) {
                    const embed = new EmbedBuilder()
                        .setColor('#FF6B6B')
                        .setTitle('🎫 Múltiplos Tickets Encontrados')
                        .setDescription('Escolha um ticket específico:');

                    Array.from(ticketMap.keys()).forEach((ticketName, index) => {
                        const purchases = ticketMap.get(ticketName);
                        const uniqueUsers = new Set(purchases.map(p => p.userId)).size;
                        embed.addFields({
                            name: `${index + 1}. ${ticketName}`,
                            value: `${uniqueUsers} participantes únicos`,
                            inline: true
                        });
                    });

                    embed.setFooter({ text: 'Use o nome exato do ticket para exportar' });
                    return interaction.editReply({ embeds: [embed] });
                }

                // Usar o primeiro (e único) ticket
                const ticketName = Array.from(ticketMap.keys())[0];
                const ticketPurchasesList = ticketMap.get(ticketName);

                participants = ticketPurchasesList.map(purchase => ({
                    userId: purchase.userId,
                    username: purchase.username,
                    ticketName: purchase.ticketId.name,
                    purchaseDate: purchase.purchaseDate,
                    quantity: purchase.quantity
                }));

                title = '📊 Lista de Participantes por Ticket';
                description = `**${ticketName}**`;
            }

            if (participants.length === 0) {
                return interaction.editReply({
                    content: `❌ Nenhum participante encontrado.`
                });
            }

            if (format === 'csv') {
                // Exportar como CSV
                let csv = 'Username,User ID,Ticket Name,Purchase Date,Quantity\n';
                participants.forEach(participant => {
                    csv += `${participant.username},${participant.userId},${participant.ticketName},${participant.purchaseDate.toISOString()},${participant.quantity || 1}\n`;
                });

                const attachment = new AttachmentBuilder(
                    Buffer.from(csv, 'utf-8'),
                    { name: `participants_${identifier.replace(/[^a-zA-Z0-9]/g, '_')}.csv` }
                );

                const embed = new EmbedBuilder()
                    .setColor('#4ECDC4')
                    .setTitle(title)
                    .setDescription(description)
                    .addFields(
                        { name: '👥 Total de Participantes', value: participants.length.toString(), inline: true },
                        { name: '📅 Data de Exportação', value: new Date().toLocaleString('pt-BR'), inline: true },
                        { name: '📁 Formato', value: 'CSV', inline: true }
                    )
                    .setFooter({ text: 'Arquivo anexado abaixo' })
                    .setTimestamp();

                await interaction.editReply({
                    content: '✅ Lista exportada com sucesso!',
                    embeds: [embed],
                    files: [attachment]
                });

            } else {
                // Exportar como lista simples
                const participantsList = participants.map((p, index) =>
                    `${index + 1}. **${p.username}** (${p.userId}) - ${p.ticketName}${p.quantity > 1 ? ` (${p.quantity} tickets)` : ''}`
                ).join('\n');

                const embed = new EmbedBuilder()
                    .setColor('#4ECDC4')
                    .setTitle(title)
                    .setDescription(description)
                    .addFields(
                        { name: '👥 Total de Participantes', value: participants.length.toString(), inline: true },
                        { name: '📅 Data de Exportação', value: new Date().toLocaleString('pt-BR'), inline: true },
                        { name: '📁 Formato', value: 'Lista Simples', inline: true }
                    );

                // Dividir em múltiplos embeds se a lista for muito longa
                const maxFieldLength = 1024;
                const chunks = [];

                for (let i = 0; i < participantsList.length; i += maxFieldLength) {
                    chunks.push(participantsList.slice(i, i + maxFieldLength));
                }

                chunks.forEach((chunk, index) => {
                    embed.addFields({
                        name: index === 0 ? '👥 Participantes' : `👥 Participantes (continuação ${index + 1})`,
                        value: chunk,
                        inline: false
                    });
                });

                embed.setFooter({ text: `Total: ${participants.length} participantes` })
                    .setTimestamp();

                await interaction.editReply({
                    content: '✅ Lista exportada com sucesso!',
                    embeds: [embed]
                });
            }

        } catch (error) {
            console.error('Erro ao exportar participantes:', error);
            await interaction.editReply({
                content: `❌ Erro ao exportar participantes: ${error.message}`
            });
        }
    }
}; 