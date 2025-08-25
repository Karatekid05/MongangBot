const { SlashCommandBuilder } = require('discord.js');
const { distributeDailyRoleRewards } = require('../utils/dailyRoleRewards');
const { isModerator } = require('../utils/permissions');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('test-role-rewards')
        .setDescription('Test daily role rewards distribution (Moderators only)')
        .addStringOption(option =>
            option.setName('roleid')
                .setDescription('Role ID to test rewards for')
                .setRequired(true)
        )
        .addIntegerOption(option =>
            option.setName('amount')
                .setDescription('Amount of cash to distribute')
                .setRequired(true)
                .setMinValue(1)
        )
        .addStringOption(option =>
            option.setName('source')
                .setDescription('Source category for the points')
                .setRequired(false)
                .addChoices(
                    { name: 'Games', value: 'games' },
                    { name: 'Memes & Art', value: 'memesAndArt' },
                    { name: 'Chat Activity', value: 'chatActivity' },
                    { name: 'Others', value: 'others' },
                    { name: 'NFT Rewards', value: 'nftRewards' }
                )
        ),

    async execute(interaction, client) {
        try {
            // Check if user is a moderator
            if (!isModerator(interaction.member)) {
                return interaction.reply({
                    content: 'This command is only available to moderators.',
                    ephemeral: true
                });
            }

            // Role-based rewards are disabled
            return interaction.reply({ content: 'Role-based rewards are disabled.', ephemeral: true });
            const roleId = interaction.options.getString('roleid');
            const amount = interaction.options.getInteger('amount');
            const source = interaction.options.getString('source') || 'others';

            await interaction.deferReply();

            console.log(`Manual role rewards distribution initiated by ${interaction.user.username}`);
            console.log(`Role ID: ${roleId}, Amount: ${amount}, Source: ${source}`);

            // Execute the distribution
            await distributeDailyRoleRewards(client, roleId, amount, source);

            await interaction.editReply({
                content: `✅ Role rewards distribution completed!\n\n**Details:**\n• Role ID: \`${roleId}\`\n• Amount per member: ${amount} $CASH\n• Source category: ${source}\n\nCheck the console logs for detailed results.`
            });

        } catch (error) {
            console.error('Error in test-role-rewards command:', error);

            const errorMessage = 'There was an error testing the role rewards distribution.';

            if (interaction.deferred) {
                await interaction.editReply({ content: errorMessage });
            } else {
                await interaction.reply({ content: errorMessage, ephemeral: true });
            }
        }
    }
}; 