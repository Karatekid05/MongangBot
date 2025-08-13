const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const { startWalletVerification, getUserNftStatus, VERIFICATION_WALLET } = require('../utils/walletVerification');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('nftverifier')
		.setDescription('Setup or use the NFT verifier UI')
		.addSubcommand(sub => sub
			.setName('setup')
			.setDescription('Post the NFT verifier message in this channel (Moderators only)')
		)
		.setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),

	async execute(interaction, client) {
		const sub = interaction.options.getSubcommand();
		if (sub === 'setup') {
			await interaction.deferReply({ ephemeral: true });

			// Build verifier embed
			const embed = new EmbedBuilder()
				.setColor('#2F3136')
				.setTitle('Welcome to the MonGang NFT Verifier')
				.setDescription(
					"Verify your wallet to receive NFT rewards.\n\n" +
					"• Daily rewards: Collection 1 — 150 $CASH, Collection 2 — 50 $CASH.\n" +
					`• Verification requires sending a tiny unique amount of MON to: ${VERIFICATION_WALLET}`
				)
				.setTimestamp();

			const row = new ActionRowBuilder().addComponents(
				new ButtonBuilder().setCustomId('nft_verify_wallet').setLabel('Verify Wallet').setStyle(ButtonStyle.Success).setEmoji('✅'),
				new ButtonBuilder().setCustomId('nft_check_status').setLabel('Check Status').setStyle(ButtonStyle.Secondary).setEmoji('🔎')
			);

			await interaction.channel.send({ embeds: [embed], components: [row] });
			await interaction.editReply('✅ Verifier message posted.');
		}
	},

	// Button handlers are wired in index.js via interaction handlers
	async handleVerifyButton(interaction, client) {
		try {
			const modal = new ModalBuilder()
				.setCustomId('nft_wallet_modal')
				.setTitle('Enter your wallet address');

			const input = new TextInputBuilder()
				.setCustomId('wallet_address')
				.setLabel('Wallet (starting with 0x)')
				.setStyle(TextInputStyle.Short)
				.setRequired(true);

			const row = new ActionRowBuilder().addComponents(input);
			modal.addComponents(row);
			await interaction.showModal(modal);
		} catch (e) {
			console.error('handleVerifyButton error:', e);
			await interaction.reply({ content: 'Error opening modal. Please try again.', ephemeral: true });
		}
	},

	async handleWalletModal(interaction, client) {
		try {
			await interaction.deferReply({ ephemeral: true });
			const address = interaction.fields.getTextInputValue('wallet_address');
			await startWalletVerification(interaction, client, address);
		} catch (e) {
			console.error('handleWalletModal error:', e);
			await interaction.editReply({ content: 'Error starting verification.', ephemeral: true });
		}
	},

	async handleCheckStatus(interaction) {
		try {
			await interaction.deferReply({ ephemeral: true });
			const status = await getUserNftStatus(interaction.user.id);
			if (!status.hasWallet) {
				return interaction.editReply('No wallet linked yet. Click Verify Wallet to start.');
			}
			await interaction.editReply(
				`Wallet: ${status.walletAddress}\nCollection 1: ${status.c1} NFTs (150 $CASH/day if > 0)\nCollection 2: ${status.c2} NFTs (50 $CASH/day if > 0)`
			);
		} catch (e) {
			console.error('handleCheckStatus error:', e);
			await interaction.editReply({ content: 'Error checking status.', ephemeral: true });
		}
	}
};
