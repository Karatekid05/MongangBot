const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { transferCash } = require('../utils/pointsManager');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('give')
        .setDescription('Give some of your $CASH to another user')
        .addUserOption(option =>
            option.setName('user')
                .setDescription('User to send $CASH to')
                .setRequired(true))
        .addIntegerOption(option =>
            option.setName('amount')
                .setDescription('Amount of $CASH to give')
                .setRequired(true)
                .setMinValue(1)),

    async execute(interaction) {
        const targetUser = interaction.options.getUser('user');
        const amount = interaction.options.getInteger('amount');

        // Validate target (can't give to self or bots)
        if (targetUser.id === interaction.user.id) {
            return interaction.reply({
                content: 'You cannot give $CASH to yourself!',
                ephemeral: true
            });
        }

        if (targetUser.bot) {
            return interaction.reply({
                content: 'You cannot give $CASH to a bot!',
                ephemeral: true
            });
        }

        // Validate amount
        if (amount <= 0) {
            return interaction.reply({
                content: 'Amount must be a positive number.',
                ephemeral: true
            });
        }

        // Defer reply to handle potentially slow database operations
        await interaction.deferReply();

        // Transfer the cash
        const result = await transferCash(interaction.user.id, targetUser.id, amount);

        if (result.success) {
            // Create a success embed
            const embed = new EmbedBuilder()
                .setTitle('💸 Cash Transfer')
                .setDescription(`You gave ${amount} $CASH to ${targetUser.username}`)
                .setColor('#00FF00')
                .addFields({ name: 'Your New Balance', value: result.message.split('Your new balance: ')[1] || 'Updated' })
                .setFooter({ text: `Transfer completed • ${new Date().toLocaleString()}` })
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });
        } else {
            // Create an error embed
            const embed = new EmbedBuilder()
                .setTitle('❌ Transfer Failed')
                .setDescription(result.message)
                .setColor('#FF0000')
                .setFooter({ text: `Transfer attempt • ${new Date().toLocaleString()}` })
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });
        }
    }
}; 