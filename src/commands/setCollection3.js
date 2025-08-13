const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const Setting = require('../models/Setting');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('setcollection3')
		.setDescription('Set the ERC contract address for HaHa x MonGang Pass (Collection 3)')
		.addStringOption(option => option.setName('address').setDescription('Contract address').setRequired(true))
		.setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),

	async execute(interaction) {
		await interaction.deferReply({ ephemeral: true });
		const address = interaction.options.getString('address');
		if (!address || !address.startsWith('0x') || address.length < 10) {
			return interaction.editReply('❌ Invalid contract address.');
		}
		await Setting.findOneAndUpdate(
			{ key: 'COLLECTION3_ADDRESS' },
			{ value: address },
			{ upsert: true }
		);
		await interaction.editReply(`✅ Collection 3 address set to: ${address}`);
	}
};
