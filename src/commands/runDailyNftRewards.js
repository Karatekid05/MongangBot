const { SlashCommandBuilder } = require('discord.js');
const { isModerator } = require('../utils/permissions');
const { dailyNftRewards } = require('../utils/nftRewards');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('run-daily-nft-rewards')
		.setDescription('Manually run the daily NFT rewards distribution (Moderators only)')
		.addBooleanOption(opt =>
			opt.setName('notify')
				.setDescription('Send DMs to users (default: true)')
				.setRequired(false)
		),

	async execute(interaction, client) {
		try {
			if (!isModerator(interaction.member)) {
				return interaction.reply({ content: 'This command is only available to moderators.', ephemeral: true });
			}

			await interaction.deferReply({ ephemeral: true });


			const notify = interaction.options.getBoolean('notify') ?? false; // default: no DMs
			await dailyNftRewards(client, { notify });

			await interaction.editReply('✅ Daily NFT rewards executed. Check logs for details.');
		} catch (error) {
			console.error('Error in run-daily-nft-rewards command:', error);
			if (interaction.deferred) {
				await interaction.editReply({ content: 'There was an error running daily NFT rewards.' });
			} else {
				await interaction.reply({ content: 'There was an error running daily NFT rewards.', ephemeral: true });
			}
		}
	}
};


