const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { transferCash } = require('../utils/pointsManager');
const User = require('../models/User');

// Role IDs for team members who shouldn't receive cash
const TEAM_ROLE_IDS = [
    '1339293248308641883', // Founders
];

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
                .setMinValue(1))
        .addStringOption(option =>
            option.setName('source')
                .setDescription('Source to give points from')
                .setRequired(true)
                .addChoices(
                    { name: 'Games', value: 'games' },
                    { name: 'Memes & Art', value: 'memesAndArt' },
                    { name: 'Chat Activity', value: 'chatActivity' },
                    { name: 'NFT Rewards', value: 'nftRewards' },
                    { name: 'Others', value: 'others' },
                    { name: 'Proportional (All Sources)', value: 'proportional' }
                )),

    async execute(interaction) {
        const targetUser = interaction.options.getUser('user');
        const amount = interaction.options.getInteger('amount');
        const source = interaction.options.getString('source');

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

        // Check if the target user is a team member (Founder or Moderator)
        try {
            const targetMember = await interaction.guild.members.fetch(targetUser.id);
            const isTeamMember = TEAM_ROLE_IDS.some(roleId => targetMember.roles.cache.has(roleId));

            if (isTeamMember) {
                return interaction.reply({
                    content: 'You cannot give $CASH to team members (Founders or Moderators).',
                    ephemeral: true
                });
            }
        } catch (error) {
            console.warn(`Could not check team roles for ${targetUser.username}:`, error);
            // Continue anyway since we can't verify
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

        // Add detailed logging for debugging proportional transfers
        if (source === 'proportional') {
            console.log(`[DEBUG] Starting proportional transfer from ${interaction.user.username} to ${targetUser.username} of ${amount} $CASH`);

            // Log sender info before transfer
            const sender = await User.findOne({ userId: interaction.user.id });
            if (sender) {
                console.log(`[DEBUG] Sender before transfer: 
                    Total cash: ${sender.cash}
                    Games: ${sender.pointsBySource.games}
                    Memes: ${sender.pointsBySource.memesAndArt}
                    Chat: ${sender.pointsBySource.chatActivity}
                    NFT: ${sender.pointsBySource.nftRewards}
                    Others: ${sender.pointsBySource.others}`);
            }
        }

        // Transfer the cash
        const result = await transferCash(interaction.user.id, targetUser.id, amount, source === 'proportional' ? null : source);

        // Additional logging after transfer for proportional mode
        if (source === 'proportional' && result.success) {
            // Log sender info after transfer
            const sender = await User.findOne({ userId: interaction.user.id });
            if (sender) {
                console.log(`[DEBUG] Sender after transfer: 
                    Total cash: ${sender.cash}
                    Games: ${sender.pointsBySource.games}
                    Memes: ${sender.pointsBySource.memesAndArt}
                    Chat: ${sender.pointsBySource.chatActivity}
                    NFT: ${sender.pointsBySource.nftRewards}
                    Others: ${sender.pointsBySource.others}`);
            }
        }

        if (result.success) {
            // Extract the new balance from the message if available
            const balanceMatch = result.message.match(/Your new balance: (\d+)/);
            const newBalance = balanceMatch ? balanceMatch[1] : 'Updated';

            // Create a success embed
            const embed = new EmbedBuilder()
                .setTitle('💸 Cash Transfer')
                .setDescription(`You gave ${amount} $CASH to ${targetUser.username}`)
                .setColor('#00FF00')
                .addFields(
                    { name: 'Your New Balance', value: newBalance },
                    { name: 'Source', value: source === 'proportional' ? 'Proportionally from all sources' : source }
                )
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