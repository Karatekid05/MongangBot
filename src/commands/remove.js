const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { removeCash } = require('../utils/pointsManager');
const { isModerator } = require('../utils/permissions');
const { AWARD_SOURCES } = require('../utils/constants');

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
    .addStringOption(option =>
      option.setName('source')
        .setDescription('Source to remove points from')
        .setRequired(true)
        .addChoices(
          { name: 'Games', value: 'games' },
          { name: 'Memes & Art', value: 'memesAndArt' },
          { name: 'Chat Activity', value: 'chatActivity' },
          { name: 'NFT Rewards', value: 'nftRewards' },
          { name: 'Others', value: 'others' },
          { name: 'Proportional (All Sources)', value: 'proportional' }
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

    const targetUser = interaction.options.getUser('user');
    const amount = interaction.options.getInteger('amount');
    const source = interaction.options.getString('source');

    // Validate inputs
    if (amount <= 0) {
      return interaction.reply({
        content: 'Amount must be a positive number',
        ephemeral: true
      });
    }

    // Defer reply to handle potentially slow database operations
    await interaction.deferReply();

    // Remove the cash (use null as source for proportional removal)
    const result = await removeCash(targetUser.id, amount, source === 'proportional' ? null : source);

    if (result.success) {
      const actualAmount = result.amountRemoved || amount;
      const sourceText = source === 'proportional' ? 'proportionally from all sources' : `from source: ${source}`;
      await interaction.editReply(`Successfully removed ${actualAmount} $CASH from ${targetUser.username} ${sourceText}`);
    } else {
      await interaction.editReply('Failed to remove $CASH. The user may not be registered in the system.');
    }
  },
}; 