const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const User = require('../models/User');
const { isModerator } = require('../utils/permissions');
const { NFT_COLLECTION1_DAILY_REWARD, NFT_COLLECTION2_DAILY_REWARD } = require('../utils/constants');

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

        const targetUser = interaction.options.getUser('user');
        const collection1Count = interaction.options.getInteger('collection1');
        const collection2Count = interaction.options.getInteger('collection2');

        // Validate inputs - check if at least one collection is specified
        if (collection1Count === null && collection2Count === null) {
            return interaction.reply({
                content: 'You must specify at least one collection count to update.',
                ephemeral: true
            });
        }

        try {
            // Find user in database
            const user = await User.findOne({ userId: targetUser.id });

            if (!user) {
                return interaction.reply({
                    content: `User ${targetUser.username} is not registered in the system.`,
                    ephemeral: true
                });
            }

            // Save original values for confirmation message
            const originalValues = {
                collection1: user.nfts.collection1Count,
                collection2: user.nfts.collection2Count
            };

            // Update NFT counts if provided
            let updated = false;
            if (collection1Count !== null) {
                user.nfts.collection1Count = collection1Count;
                updated = true;
            }

            if (collection2Count !== null) {
                user.nfts.collection2Count = collection2Count;
                updated = true;
            }

            if (updated) {
                await user.save();

                // Calculate daily rewards
                const dailyReward = (user.nfts.collection1Count * NFT_COLLECTION1_DAILY_REWARD) +
                    (user.nfts.collection2Count * NFT_COLLECTION2_DAILY_REWARD);

                // Build confirmation message
                const message = [
                    `NFT holdings updated for ${targetUser.username}:`,
                    `• Collection 1: ${originalValues.collection1} → ${user.nfts.collection1Count} (${user.nfts.collection1Count * NFT_COLLECTION1_DAILY_REWARD} $CASH/day)`,
                    `• Collection 2: ${originalValues.collection2} → ${user.nfts.collection2Count} (${user.nfts.collection2Count * NFT_COLLECTION2_DAILY_REWARD} $CASH/day)`,
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
    }
}; 