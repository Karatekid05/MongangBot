const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { checkAllUsersNfts, checkUserNfts } = require('../utils/monadNftChecker');
const User = require('../models/User');
const { isModerator } = require('../utils/permissions');
const { NFT_COLLECTION1_DAILY_REWARD, NFT_COLLECTION2_DAILY_REWARD } = require('../utils/constants');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('syncnfts')
        .setDescription('Synchronizes users\' NFTs with the blockchain (Moderator only)')
        .addUserOption(option =>
            option.setName('user')
                .setDescription('Specific user to synchronize (optional)'))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),

    async execute(interaction) {
        // Check if user has moderator role
        if (!isModerator(interaction.member)) {
            return interaction.reply({
                content: 'You do not have permission to use this command. This command is for moderators only.',
                ephemeral: true
            });
        }

        // Check if it's for a specific user or all users
        const targetUser = interaction.options.getUser('user');

        // Defer reply for potentially slow operations
        await interaction.deferReply();

        try {
            if (targetUser) {
                // Synchronize just one user
                const user = await User.findOne({ userId: targetUser.id });

                if (!user) {
                    return interaction.editReply(`User ${targetUser.username} is not registered in the system.`);
                }

                if (!user.walletAddress) {
                    return interaction.editReply(`User ${targetUser.username} has not registered a wallet address.`);
                }

                const nftHoldings = await checkUserNfts(user.userId, user.walletAddress);

                if (nftHoldings) {
                    const collection1Reward = nftHoldings.collection1Count > 0 ? NFT_COLLECTION1_DAILY_REWARD : 0;
                    const collection2Reward = nftHoldings.collection2Count > 0 ? NFT_COLLECTION2_DAILY_REWARD : 0;
                    const dailyReward = collection1Reward + collection2Reward;

                    await interaction.editReply(
                        `NFTs updated for ${targetUser.username}:\n` +
                        `- Collection 1: ${nftHoldings.collection1Count} NFTs ${nftHoldings.collection1Count > 0 ? `(${NFT_COLLECTION1_DAILY_REWARD} $CASH/day)` : "(0 $CASH/day)"}\n` +
                        `- Collection 2: ${nftHoldings.collection2Count} NFTs ${nftHoldings.collection2Count > 0 ? `(${NFT_COLLECTION2_DAILY_REWARD} $CASH/day)` : "(0 $CASH/day)"}\n\n` +
                        `Daily reward: ${dailyReward} $CASH`
                    );
                } else {
                    await interaction.editReply(`Could not verify NFTs for ${targetUser.username}.`);
                }
            } else {
                // Synchronize all users
                await interaction.editReply('Starting NFT synchronization for all users...');

                await checkAllUsersNfts();

                await interaction.editReply('NFT synchronization completed for all users with registered wallets.');
            }
        } catch (error) {
            console.error('Error synchronizing NFTs:', error);
            await interaction.editReply('An error occurred while synchronizing NFTs. Check the console for details.');
        }
    },
}; 