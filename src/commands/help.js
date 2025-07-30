const { SlashCommandBuilder, EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder } = require('discord.js');
const { isModerator } = require('../utils/permissions');
const { NFT_COLLECTION1_DAILY_REWARD, NFT_COLLECTION2_DAILY_REWARD } = require('../utils/constants');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('help')
        .setDescription('Get help with using the MonGang Bot'),

    async execute(interaction) {
        // Create the buttons
        const userHelpButton = new ButtonBuilder()
            .setCustomId('user_help')
            .setLabel('User Guide')
            .setStyle(ButtonStyle.Primary)
            .setEmoji('👤');

        const moderatorHelpButton = new ButtonBuilder()
            .setCustomId('mod_help')
            .setLabel('Moderator Guide')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('🛡️');

        const ticketHelpButton = new ButtonBuilder()
            .setCustomId('ticket_help')
            .setLabel('Ticket System')
            .setStyle(ButtonStyle.Success)
            .setEmoji('🎫');

        const marketHelpButton = new ButtonBuilder()
            .setCustomId('market_help')
            .setLabel('Market System')
            .setStyle(ButtonStyle.Danger)
            .setEmoji('🛒');

        // Create the action row with buttons
        const row = new ActionRowBuilder()
            .addComponents(userHelpButton, moderatorHelpButton, ticketHelpButton, marketHelpButton);

        // Create initial embed
        const initialEmbed = new EmbedBuilder()
            .setColor('#5865F2')
            .setTitle('MonGang Bot Help')
            .setDescription('Welcome to the MonGang Bot Help Center! Please select an option below:')
            .addFields(
                { name: '👤 User Guide', value: 'Learn how to use commands available to all users', inline: true },
                { name: '🛡️ Moderator Guide', value: 'Learn how to use moderator-only commands', inline: true },
                { name: '🎫 Ticket System', value: 'Learn about the ticket/event system', inline: true },
                { name: '🛒 Market System', value: 'Learn about the market system', inline: true }
            )
            .setFooter({ text: 'MonGang Bot • Help System' })
            .setTimestamp();

        // Send the message with buttons
        await interaction.reply({
            embeds: [initialEmbed],
            components: [row]
        });
    }
}; 