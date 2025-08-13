const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const { startWalletVerification, getUserNftStatus, VERIFICATION_WALLET } = require('../utils/walletVerification');
const { NFT_COLLECTION1_DAILY_REWARD, NFT_COLLECTION2_DAILY_REWARD, COLLECTION3_NAME } = require('../utils/constants');
const User = require('../models/User');
const { checkUserNfts, getNftsForCollection } = require('../utils/monadNftChecker');
const Setting = require('../models/Setting');
const { COLLECTION3_CONTRACT_ADDRESS } = require('../utils/constants');

// cooldown map for status checks (per user)
const statusCooldown = new Map();
const DEFAULT_STATUS_COOLDOWN_MS = 30 * 60 * 1000; // 30 minutes fallback

async function getStatusCooldownMs() {
	const s = await Setting.findOne({ key: 'NFT_STATUS_COOLDOWN_MS' });
	return s ? Number(s.value) : DEFAULT_STATUS_COOLDOWN_MS;
}

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
				.setTitle('Welcome to the Mongang NFT Verifier')
				.setDescription(
					`Verify your wallet to receive NFT rewards.\n\n` +
					`Rewards:\n` +
					`• Collection 1 — ${NFT_COLLECTION1_DAILY_REWARD} $CASH/day\n` +
					`• Collection 2 — ${NFT_COLLECTION2_DAILY_REWARD} $CASH/day.\n` +
					`• ${COLLECTION3_NAME} — <@&1402656276441469050>\n\n` +
					`Status Check:\n` +
					`Use the 'Check Status' button to view your:\n` +
					`• Current NFT holdings\n` +
					`• Verification status\n\n` +
					`Verification will require sending a tiny unique amount of MON to: ${VERIFICATION_WALLET}\n\n` +
					`Note: NFT holdings are automatically synced daily, but you can force a sync by checking your status.\n\n`
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
			const cooldownMs = await getStatusCooldownMs();
			const now = Date.now();
			const last = statusCooldown.get(interaction.user.id) || 0;
			if (now - last < cooldownMs) {
				const remainingMs = cooldownMs - (now - last);
				const mins = Math.ceil(remainingMs / 60000);
				return interaction.reply({ content: `Please wait ${mins} minute(s) before checking again.`, ephemeral: true });
			}

			statusCooldown.set(interaction.user.id, now);
			await interaction.deferReply({ ephemeral: true });

			// Force a sync of NFTs before reporting status
			const user = await User.findOne({ userId: interaction.user.id });
			if (user && user.walletAddress) {
				try { await checkUserNfts(user, interaction.guild); } catch {}
			}

			const status = await getUserNftStatus(interaction.user.id);
			const verifiedText = user?.walletVerified ? 'Verified' : 'Not verified';

			// Collection 3 line based on NFT holdings (static contract)
			let c3Line = `<@&1402656276441469050> not live yet`;
			if (COLLECTION3_CONTRACT_ADDRESS) {
				let hasPass = false;
				if (user && user.walletAddress) {
					try {
						const c3Count = await getNftsForCollection(user.walletAddress, COLLECTION3_CONTRACT_ADDRESS, 0);
						hasPass = c3Count > 0;
					} catch {}
				}
				c3Line = hasPass ? `<@&1402656276441469050> assigned` : `<@&1402656276441469050> not assigned/removed.`;
			}

			const lines = [
				`Wallet: ${status.hasWallet ? status.walletAddress : 'Not linked'}`,
				'',
				`Collection 1: ${status.c1} NFTs (${NFT_COLLECTION1_DAILY_REWARD} $CASH/day)`,
				`Collection 2: ${status.c2} NFTs (${NFT_COLLECTION2_DAILY_REWARD} $CASH/day)`,
				'',
				c3Line,
				'',
				`Verification status: ${verifiedText}`
			];

			await interaction.editReply(lines.join('\n'));
		} catch (e) {
			console.error('handleCheckStatus error:', e);
			await interaction.editReply({ content: 'Error checking status.', ephemeral: true });
		}
	}
};
