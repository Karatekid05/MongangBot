const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { exportLeaderboards } = require('../utils/googleSheets');
const { isModerator } = require('../utils/permissions');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('export-leaderboards')
        .setDescription('Export leaderboards to Google Sheets (Moderator only)')
        .addBooleanOption(option =>
            option.setName('weekly')
                .setDescription('Export weekly leaderboards instead of total')
                .setRequired(false))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),

    async execute(interaction) {
        // Check if user has moderator role
        if (!isModerator(interaction.member)) {
            return interaction.reply({
                content: 'You do not have permission to use this command. This command is for moderators only.',
                ephemeral: true
            });
        }

        const isWeekly = interaction.options.getBoolean('weekly') || false;

        try {
            // Defer reply to handle potentially slow operation
            await interaction.deferReply();

            console.log(`Starting export command: weekly=${isWeekly}`);

            // Export leaderboards
            const success = await exportLeaderboards(isWeekly);

            if (success) {
                await interaction.editReply(`Successfully exported ${isWeekly ? 'weekly' : 'total'} leaderboards to Google Sheets.`);
            } else {
                await interaction.editReply('Failed to export leaderboards to Google Sheets. Check the bot logs for details.');
            }

        } catch (error) {
            console.error('Error in export-leaderboards command:', error);

            // Try to respond to the interaction
            try {
                if (interaction.deferred) {
                    await interaction.editReply('An error occurred while exporting leaderboards. Check bot logs for details.');
                } else {
                    await interaction.reply({
                        content: 'An error occurred while exporting leaderboards. Check bot logs for details.',
                        ephemeral: true
                    });
                }
            } catch (replyError) {
                console.error('Error sending error message:', replyError);
            }
        }
    },
}; 