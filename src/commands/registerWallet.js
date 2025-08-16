const { SlashCommandBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('registerwallet')
        .setDescription('Register your Monad wallet to receive NFT rewards (disabled)')
        .addStringOption(option =>
            option.setName('address')
                .setDescription('Your Monad wallet address (starting with 0x)')
                .setRequired(false)),

    async execute(interaction) {
        return interaction.reply({
            content: 'Wallet linking is disabled. Verification is now handled via Matrica roles. If you have one of the Matrica roles, you will be rewarded automatically.',
            ephemeral: true
        });
    }
};