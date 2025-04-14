const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const User = require('../models/User');
const Gang = require('../models/Gang');
const { isModerator } = require('../utils/permissions');
const { updateGangTotals } = require('../utils/pointsManager');

// Role IDs para membros da equipe que não devem ganhar pontos
const TEAM_ROLE_IDS = [
    '1339293248308641883', // Founders
    '1338993206112817283'  // Moderators
];

module.exports = {
    data: new SlashCommandBuilder()
        .setName('resetteamcash')
        .setDescription('Reset all $CASH from team members (Moderator only)')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    async execute(interaction) {
        // Check if user has moderator role
        if (!isModerator(interaction.member)) {
            return interaction.reply({
                content: 'You do not have permission to use this command. This command is for moderators only.',
                ephemeral: true
            });
        }

        // Defer reply to handle potentially slow database operations
        await interaction.deferReply();

        try {
            // Get all users from the database
            const users = await User.find();
            const guild = interaction.guild;

            let resetCount = 0;
            let totalResetCash = 0;
            let affectedGangs = new Set();

            // Iterate through each user and check if they have a team role
            for (const user of users) {
                try {
                    // Fetch the Discord member
                    const member = await guild.members.fetch(user.userId).catch(() => null);

                    if (!member) continue; // Skip if member not found

                    // Check if member has a team role
                    const isTeamMember = TEAM_ROLE_IDS.some(roleId => member.roles.cache.has(roleId));
                    const isModeratorCheck = isModerator(member);

                    if (isTeamMember || isModeratorCheck) {
                        // Store the original amounts for logging
                        const originalCash = user.cash;
                        const originalWeeklyCash = user.weeklyCash;

                        // Reset cash to 0 for team members
                        if (originalCash > 0 || originalWeeklyCash > 0) {
                            totalResetCash += user.cash;

                            // Record gang for updating totals
                            if (user.gangId) {
                                affectedGangs.add(user.gangId);
                            }

                            // Reset all cash and point sources
                            user.cash = 0;
                            user.weeklyCash = 0;

                            // Reset all point sources to 0
                            for (const source in user.pointsBySource) {
                                user.pointsBySource[source] = 0;
                            }

                            await user.save();
                            resetCount++;

                            console.log(`Reset team member ${user.username}: ${originalCash} → 0 $CASH, ${originalWeeklyCash} → 0 weekly $CASH`);
                        }
                    }
                } catch (memberError) {
                    console.error(`Error checking team member ${user.username}:`, memberError);
                }
            }

            // Update all affected gang totals
            for (const gangId of affectedGangs) {
                await updateGangTotals(gangId);
            }

            // Send response
            if (resetCount > 0) {
                await interaction.editReply(`Reset $CASH for ${resetCount} team members, totaling ${totalResetCash} $CASH. ${affectedGangs.size} gangs were updated.`);
            } else {
                await interaction.editReply('No team members with $CASH were found.');
            }

        } catch (error) {
            console.error('Error resetting team cash:', error);
            await interaction.editReply('An error occurred while resetting team cash. Check the console for details.');
        }
    }
}; 