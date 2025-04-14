const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { resetWeeklyStats } = require('../utils/pointsManager');
const { exportLeaderboards } = require('../utils/googleSheets');
const { isModerator } = require('../utils/permissions');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('reset')
        .setDescription('Reset weekly stats and export them (Moderator only)')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),

    async execute(interaction) {
        // Check if user has moderator role
        if (!isModerator(interaction.member)) {
            return interaction.reply({
                content: 'You do not have permission to use this command. This command is for moderators only.',
                ephemeral: true
            });
        }

        // Defer reply to handle potentially slow operations
        await interaction.deferReply();

        try {
            // First export the weekly data
            await interaction.editReply('Exporting weekly leaderboards before reset...');
            const exportSuccess = await exportLeaderboards(true, true);

            if (!exportSuccess) {
                return interaction.editReply('Failed to export weekly leaderboards. Reset aborted.');
            }

            // Then reset the weekly stats
            await interaction.editReply('Weekly leaderboards exported. Resetting weekly stats...');
            const resetSuccess = await resetWeeklyStats();

            if (!resetSuccess) {
                return interaction.editReply('Failed to reset weekly stats.');
            }

            await interaction.editReply('Weekly stats have been reset successfully and the data was exported to Google Sheets.');
        } catch (error) {
            console.error('Error during reset:', error);
            await interaction.editReply('An error occurred while resetting weekly stats. Check console for details.');
        }
    },
}; 