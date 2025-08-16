const { SlashCommandBuilder } = require('discord.js');
const { isModerator } = require('../utils/permissions');
const { nightlyMatricaRoleRewards } = require('../utils/dailyRoleRewards');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('run-nightly-matrica')
		.setDescription('Run nightly Matrica role-based rewards now (Moderators only)'),

	async execute(interaction, client) {
		try {
			if (!isModerator(interaction.member)) {
				return interaction.reply({ content: 'This command is only available to moderators.', ephemeral: true });
			}

			await interaction.deferReply({ ephemeral: true });
			await nightlyMatricaRoleRewards(client);
			await interaction.editReply('✅ Nightly Matrica rewards executed. Check logs for details.');
		} catch (error) {
			console.error('Error running nightly Matrica rewards:', error);
			if (interaction.deferred) {
				await interaction.editReply({ content: 'There was an error running nightly Matrica rewards.' });
			} else {
				await interaction.reply({ content: 'There was an error running nightly Matrica rewards.', ephemeral: true });
			}
		}
	}
};


