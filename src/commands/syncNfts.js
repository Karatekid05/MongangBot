const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('syncnfts')
        .setDescription('Synchronize NFTs (disabled)')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),

    async execute(interaction) {
        return interaction.reply({ content: 'NFT synchronization is disabled. Verification/rewards are handled by Matrica roles now.', ephemeral: true });
    },
};