const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const User = require('../models/User');
const { isModerator } = require('../utils/permissions');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('updatenft')
        .setDescription('Manually update a user\'s NFT holdings (Moderator only)')
        .addUserOption(option =>
            option.setName('user')
                .setDescription('User to update NFTs for')
                .setRequired(true))
        .addIntegerOption(option =>
            option.setName('collection1')
                .setDescription('Number of NFTs from collection 1')
                .setRequired(false)
                .setMinValue(0)
                .setMaxValue(100))
        .addIntegerOption(option =>
            option.setName('collection2')
                .setDescription('Number of NFTs from collection 2')
                .setRequired(false)
                .setMinValue(0)
                .setMaxValue(100))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),

    async execute(interaction) {
        // Check if user has moderator role
        if (!isModerator(interaction.member)) {
            return interaction.reply({
                content: 'You do not have permission to use this command. This command is for moderators only.',
                ephemeral: true
            });
        }

        // Get command options
        const targetUser = interaction.options.getUser('user');
        const collection1 = interaction.options.getInteger('collection1');
        const collection2 = interaction.options.getInteger('collection2');

        // At least one collection amount must be provided
        if (collection1 === null && collection2 === null) {
            return interaction.reply({
                content: 'You must specify at least one collection amount to update.',
                ephemeral: true
            });
        }

        try {
            // Find user in database
            const user = await User.findOne({ userId: targetUser.id });

            if (!user) {
                return interaction.reply({
                    content: `${targetUser.username} is not registered in the system. They need to send a message in a gang channel first.`,
                    ephemeral: true
                });
            }

            // If user has no wallet address registered, inform the moderator
            if (!user.walletAddress) {
                return interaction.reply({
                    content: `${targetUser.username} has not registered a wallet address yet. They need to use /registerwallet first.`,
                    ephemeral: true
                });
            }

            // Update NFT counts if provided
            let updated = false;
            const originalValues = {
                collection1: user.nfts.collection1Count,
                collection2: user.nfts.collection2Count
            };

            if (collection1 !== null) {
                user.nfts.collection1Count = collection1;
                updated = true;
            }

            if (collection2 !== null) {
                user.nfts.collection2Count = collection2;
                updated = true;
            }

            if (updated) {
                await user.save();

                // Calculate daily rewards
                const dailyReward = (user.nfts.collection1Count * 100) + (user.nfts.collection2Count * 10);

                // Build confirmation message
                const message = [
                    `NFT holdings updated for ${targetUser.username}:`,
                    `• Collection 1: ${originalValues.collection1} → ${user.nfts.collection1Count}`,
                    `• Collection 2: ${originalValues.collection2} → ${user.nfts.collection2Count}`,
                    ``,
                    `Daily reward: ${dailyReward} $CASH`
                ].join('\n');

                await interaction.reply({
                    content: message,
                    ephemeral: true
                });
            } else {
                await interaction.reply({
                    content: 'No changes were made to the NFT holdings.',
                    ephemeral: true
                });
            }
        } catch (error) {
            console.error('Error updating NFT holdings:', error);
            await interaction.reply({
                content: 'An error occurred while updating NFT holdings. Check the console for details.',
                ephemeral: true
            });
        }
    },
}; 