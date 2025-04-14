const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { removeTrophy } = require('../utils/pointsManager');
const Gang = require('../models/Gang');
const { isModerator } = require('../utils/permissions');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('removetrophy')
        .setDescription('Remove a trophy from a gang (Moderator only)')
        .addStringOption(option =>
            option.setName('gang')
                .setDescription('The gang to remove a trophy from')
                .setRequired(true)
                .addChoices(
                    { name: 'Sea Kings', value: 'Sea Kings' },
                    { name: 'Thunder Birds', value: 'Thunder Birds' },
                    { name: 'Fluffy Ninjas', value: 'Fluffy Ninjas' },
                    { name: 'Chunky Cats', value: 'Chunky Cats' }
                ))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),

    async execute(interaction) {
        // Check if user has moderator role
        if (!isModerator(interaction.member)) {
            return interaction.reply({
                content: 'You do not have permission to use this command. This command is for moderators only.',
                ephemeral: true
            });
        }

        const gangName = interaction.options.getString('gang');

        // Defer reply to handle potentially slow database operations
        await interaction.deferReply();

        // Find gang
        const gang = await Gang.findOne({ name: gangName });
        if (!gang) {
            return interaction.editReply(`Gang not found: ${gangName}`);
        }

        // Check if gang has trophies
        if (gang.trophies <= 0) {
            return interaction.editReply(`${gangName} doesn't have any trophies to remove.`);
        }

        // Remove trophy
        const success = await removeTrophy(gang.roleId);

        if (success) {
            await interaction.editReply(`Successfully removed a trophy from ${gangName}. They now have ${gang.trophies - 1} trophies.`);
        } else {
            await interaction.editReply(`Failed to remove trophy from ${gangName}.`);
        }
    },
}; 