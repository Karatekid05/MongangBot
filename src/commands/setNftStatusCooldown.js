const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const Setting = require('../models/Setting');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('setnftstatuscooldown')
		.setDescription('Set the cooldown (in minutes) for the NFT Check Status button')
		.addIntegerOption(opt => opt
			.setName('minutes')
			.setDescription('Cooldown in minutes (1-120)')
			.setRequired(true)
			.setMinValue(1)
			.setMaxValue(120)
		)
		.setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),

	async execute(interaction) {
		await interaction.deferReply({ ephemeral: true });
		const minutes = interaction.options.getInteger('minutes');
		const ms = minutes * 60 * 1000;
		await Setting.findOneAndUpdate(
			{ key: 'NFT_STATUS_COOLDOWN_MS' },
			{ value: String(ms) },
			{ upsert: true }
		);
		await interaction.editReply(`✅ NFT status cooldown set to ${minutes} minute(s).`);
	}
};
