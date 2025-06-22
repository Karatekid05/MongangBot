const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const Ticket = require('../models/Ticket');
const { isModerator } = require('../utils/permissions');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('createticket')
        .setDescription('Criar novo ticket/evento (apenas moderadores)')
        .addStringOption(option =>
            option.setName('name')
                .setDescription('Nome do ticket/evento')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('description')
                .setDescription('Descrição do evento')
                .setRequired(true))
        .addIntegerOption(option =>
            option.setName('price')
                .setDescription('Preço em $CASH por ticket')
                .setRequired(true)
                .setMinValue(1))
        .addIntegerOption(option =>
            option.setName('max_tickets')
                .setDescription('Número máximo de tickets')
                .setRequired(true)
                .setMinValue(1))
        .addStringOption(option =>
            option.setName('role_id')
                .setDescription('ID do role no Discord')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('role_name')
                .setDescription('Nome do role (para exibição)')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('event_type')
                .setDescription('Tipo de evento')
                .addChoices(
                    { name: 'Lottery (Loteria)', value: 'lottery' },
                    { name: 'Poker', value: 'poker' },
                    { name: 'Tournament (Torneio)', value: 'tournament' },
                    { name: 'Custom', value: 'custom' }
                )
                .setRequired(true))
        .addIntegerOption(option =>
            option.setName('max_per_user')
                .setDescription('Máximo de tickets por usuário')
                .setMinValue(1)
                .setMaxValue(10)
                .setRequired(true))
        .addBooleanOption(option =>
            option.setName('auto_assign_role')
                .setDescription('Atribuir role automaticamente ao comprar'))
        .addStringOption(option =>
            option.setName('time_limit_date')
                .setDescription('Data limite para vendas (YYYY-MM-DD HH:MM) - opcional')),

    async execute(interaction) {
        // Verificar se é moderador
        if (!isModerator(interaction.member)) {
            return interaction.reply({
                content: '❌ Apenas moderadores podem criar tickets.',
                ephemeral: true
            });
        }

        await interaction.deferReply({ ephemeral: true });

        try {
            const name = interaction.options.getString('name');
            const description = interaction.options.getString('description');
            const price = interaction.options.getInteger('price');
            const maxTickets = interaction.options.getInteger('max_tickets');
            const roleId = interaction.options.getString('role_id');
            const roleName = interaction.options.getString('role_name');
            const eventType = interaction.options.getString('event_type');
            const maxPerUser = interaction.options.getInteger('max_per_user');
            const autoAssignRole = interaction.options.getBoolean('auto_assign_role') !== false; // Default true
            const timeLimitDate = interaction.options.getString('time_limit_date');

            // Verificar se já existe um ticket com este nome
            const existingTicket = await Ticket.findOne({
                name: { $regex: name, $options: 'i' }
            });

            if (existingTicket) {
                return interaction.editReply({
                    content: `❌ Já existe um ticket com o nome "${name}".`
                });
            }

            // Validar role ID
            const guild = interaction.guild;
            const role = guild.roles.cache.get(roleId);
            if (!role) {
                return interaction.editReply({
                    content: `❌ Role com ID "${roleId}" não encontrado no servidor.`
                });
            }

            // Validar data limite se fornecida
            let parsedTimeLimit = null;
            if (timeLimitDate) {
                parsedTimeLimit = new Date(timeLimitDate);
                if (isNaN(parsedTimeLimit.getTime())) {
                    return interaction.editReply({
                        content: '❌ Formato de data inválido. Use: YYYY-MM-DD HH:MM'
                    });
                }
                if (parsedTimeLimit <= new Date()) {
                    return interaction.editReply({
                        content: '❌ A data limite deve ser no futuro.'
                    });
                }
            }

            // Criar configurações do ticket
            const settings = {
                maxTicketsPerUser: maxPerUser,
                autoAssignRole: autoAssignRole
            };

            // Configurações específicas por tipo
            let lotteryConfig = null;
            if (eventType === 'lottery') {
                const prizePool = Math.floor(price * maxTickets * 0.8); // 80% da receita total
                lotteryConfig = {
                    prizePool: prizePool,
                    drawn: false,
                    drawDate: null
                };
            }

            // Criar o ticket
            const ticket = new Ticket({
                name: name,
                description: description,
                price: price,
                maxTickets: maxTickets,
                soldTickets: 0,
                roleId: roleId,
                roleName: roleName,
                eventType: eventType,
                status: 'active',
                settings: settings,
                lottery: lotteryConfig,
                timeLimitDate: parsedTimeLimit
            });

            await ticket.save();

            const embed = new EmbedBuilder()
                .setColor('#00FF00')
                .setTitle('✅ Ticket Criado com Sucesso!')
                .setDescription(`**${name}**`)
                .addFields(
                    { name: '📝 Descrição', value: description, inline: false },
                    { name: '💰 Preço', value: `${price} $CASH`, inline: true },
                    { name: '🎫 Máximo', value: maxTickets.toString(), inline: true },
                    { name: '👤 Por Usuário', value: maxPerUser.toString(), inline: true },
                    { name: '🏷️ Role', value: roleName, inline: true },
                    { name: '🎮 Tipo', value: eventType.charAt(0).toUpperCase() + eventType.slice(1), inline: true },
                    { name: '⚙️ Auto-assign Role', value: autoAssignRole ? 'Sim' : 'Não', inline: true }
                );

            if (timeLimitDate) {
                embed.addFields({
                    name: '⏰ Data Limite',
                    value: parsedTimeLimit.toLocaleString('pt-BR'),
                    inline: true
                });
            }

            if (eventType === 'lottery' && lotteryConfig) {
                embed.addFields({
                    name: '🎲 Prêmio da Loteria',
                    value: `${lotteryConfig.prizePool} $CASH`,
                    inline: true
                });
            }

            embed.setFooter({ text: `ID: ${ticket._id}` })
                .setTimestamp();

            await interaction.editReply({
                content: `✅ Ticket "${name}" criado com sucesso!`,
                embeds: [embed]
            });

        } catch (error) {
            console.error('Erro ao criar ticket:', error);
            await interaction.editReply({
                content: `❌ Erro ao criar ticket: ${error.message}`
            });
        }
    }
}; 