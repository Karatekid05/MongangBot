const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('nftverifier')
		.setDescription('NFT verifier (disabled)')
		.addSubcommand(sub => sub
			.setName('setup')
			.setDescription('Post the NFT verifier message (disabled)')
		)
		.setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),

	async execute(interaction) {
		return interaction.reply({ content: 'NFT verification via wallet is disabled. Verification is now handled by Matrica roles. If you hold one of the Matrica roles, you will be included automatically.', ephemeral: true });
	}
};
