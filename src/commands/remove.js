const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { removeCash } = require('../utils/pointsManager');
const { isModerator } = require('../utils/permissions');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('remove')
    .setDescription('Remove $CASH from a user (Moderator only)')
    .addUserOption(option =>
      option.setName('user')
        .setDescription('The user to remove $CASH from')
        .setRequired(true))
    .addIntegerOption(option =>
      option.setName('amount')
        .setDescription('Amount of $CASH to remove')
        .setRequired(true)
        .setMinValue(1))
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
    const amount = interaction.options.getInteger('amount');

    // Validate inputs
    if (amount <= 0) {
      return interaction.reply({
        content: 'Amount must be a positive number',
        ephemeral: true
      });
    }

    // Defer reply to handle potentially slow database operations
    await interaction.deferReply();

    // Remove the cash
    const result = await removeCash(targetUser.id, amount);

    if (result.success) {
      const actualAmount = result.amountRemoved || amount;
      await interaction.editReply(`Successfully removed ${actualAmount} $CASH from ${targetUser.username}`);
    } else {
      await interaction.editReply('Failed to remove $CASH. The user may not be registered in the system.');
    }
  },
}; 