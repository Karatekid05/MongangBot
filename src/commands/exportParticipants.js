const { SlashCommandBuilder, EmbedBuilder, AttachmentBuilder } = require('discord.js');
const { getParticipantsByRole, exportParticipantsList, getTicketDetails } = require('../utils/ticketManager');
const { isModerator } = require('../utils/permissions');
const TicketPurchase = require('../models/TicketPurchase');
const Ticket = require('../models/Ticket');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('exportparticipants')
        .setDescription('Export participant list for a ticket (moderators only)')
        .addStringOption(option =>
            option.setName('ticket_name')
                .setDescription('Name of the ticket to export participants from')
                .setRequired(true)
                .setAutocomplete(true)),

    async autocomplete(interaction) {
        const focusedValue = interaction.options.getFocused();
        // Show all tickets, including completed/cancelled ones, for historical export
        const tickets = await Ticket.find({
            name: { $regex: focusedValue, $options: 'i' }
        }).limit(25);

        await interaction.respond(
            tickets.map(ticket => ({ name: `[${ticket.status.toUpperCase()}] ${ticket.name}`, value: ticket.name })),
        );
    },

    async execute(interaction, client) {
        if (!isModerator(interaction.member)) {
            return interaction.reply({
                content: '❌ Only moderators can export participant lists.',
                ephemeral: true
            });
        }

        await interaction.deferReply({ ephemeral: true });

        try {
            const ticketName = interaction.options.getString('ticket_name');
            const ticket = await Ticket.findOne({ name: ticketName });

            if (!ticket) {
                return interaction.editReply({
                    content: `❌ Ticket "${ticketName}" not found.`
                });
            }

            const csvData = await exportParticipantsList(ticket._id);

            if (!csvData || csvData.startsWith('No participants')) {
                return interaction.editReply({
                    content: `🟡 No participants found for ticket **${ticket.name}**.`
                });
            }

            const attachment = new AttachmentBuilder(Buffer.from(csvData, 'utf-8'), {
                name: `participants-${ticket.name.replace(/ /g, '_')}.csv`
            });

            const embed = new EmbedBuilder()
                .setColor('#00FF00')
                .setTitle('✅ Participant List Exported')
                .setDescription(`Participant list for **${ticket.name}** has been successfully exported.`)
                .setTimestamp();

            await interaction.editReply({
                content: '✅ List exported successfully!',
                embeds: [embed],
                files: [attachment]
            });

        } catch (error) {
            console.error('Error exporting participants:', error);
            await interaction.editReply({
                content: `❌ Error exporting participants: ${error.message}`
            });
        }
    }
}; 