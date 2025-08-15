const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const { startWalletVerification, getUserNftStatus, VERIFICATION_WALLET, triggerVerifyNow, hasPendingVerification } = require('../utils/walletVerification');
const { NFT_COLLECTION1_DAILY_REWARD, NFT_COLLECTION2_DAILY_REWARD, COLLECTION3_NAME, COLLECTION3_CONTRACT_ADDRESS, COLLECTION3_ROLE_ID } = require('../utils/constants');
const User = require('../models/User');
const { checkUserNfts, getNftsForCollection, hasCollection3Pass } = require('../utils/monadNftChecker');
const Setting = require('../models/Setting');

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
					`• Rewards:\n` +
					`  Collection 1 — ${NFT_COLLECTION1_DAILY_REWARD} $CASH/day\n` +
					`  Collection 2 — ${NFT_COLLECTION2_DAILY_REWARD} $CASH/day.\n` +
					`  ${COLLECTION3_NAME} — <@&1402656276441469050>\n\n` +
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
			await interaction.reply({ content: 'Error opening modal. Please try again.', ephemeral: true });
		}
	},

	async handleWalletModal(interaction, client) {
		try {
			await interaction.deferReply({ ephemeral: true });
			const address = interaction.fields.getTextInputValue('wallet_address');
			await startWalletVerification(interaction, client, address);
		} catch (e) {
			await interaction.editReply({ content: 'Error starting verification.', ephemeral: true });
		}
	},

    async handleCheckStatus(interaction) {
		try {
            const cooldownMs = await getStatusCooldownMs();
            const now = Date.now();
            const last = statusCooldown.get(interaction.user.id) || 0;

            // Preload user to know if there is a DB-persisted pending verification
            const user = await User.findOne({ userId: interaction.user.id });
            const hasPending = hasPendingVerification(interaction.user.id) || !!user?.verificationPending;

            // Bypass cooldown if verification is pending
            if (!hasPending && now - last < cooldownMs) {
                const remainingMs = cooldownMs - (now - last);
                const mins = Math.ceil(remainingMs / 60000);
                return interaction.reply({ content: `Please wait ${mins} minute(s) before checking again.`, ephemeral: true });
            }

            statusCooldown.set(interaction.user.id, now);
            await interaction.deferReply({ ephemeral: true });

            // If user has a pending verification, try to confirm once immediately
            try {
                if (hasPending) {
                    await triggerVerifyNow(interaction.user.id, interaction.client);
                }
            } catch {}

			if (user && user.walletAddress) {
				try { await checkUserNfts(user, interaction.guild, {}); } catch {}
			}

			const status = await getUserNftStatus(interaction.user.id);
			const verifiedText = user?.walletVerified ? 'Verified' : 'Not verified';

			let c3Line;
			if (!COLLECTION3_CONTRACT_ADDRESS) {
				c3Line = `<@&${COLLECTION3_ROLE_ID}> not live yet`;
			} else if (!user?.walletAddress) {
				c3Line = `Link your wallet to check eligibility for <@&${COLLECTION3_ROLE_ID}>`;
			} else {
				let hasPass = false;
				try { hasPass = await hasCollection3Pass(user.walletAddress, {}); } catch {}
				c3Line = hasPass ? `<@&${COLLECTION3_ROLE_ID}> assigned` : `<@&${COLLECTION3_ROLE_ID}> not assigned/removed.`;
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

            // If verification is pending, add progress info inline (no DMs)
            if (hasPending) {
                let remaining = '';
                if (user?.verificationTimestamp) {
                    const deadline = new Date(user.verificationTimestamp).getTime() + (5 * 60 * 1000);
                    const remMs = Math.max(0, deadline - Date.now());
                    const remMin = Math.ceil(remMs / 60000);
                    remaining = ` (~${remMin} min left)`;
                }
                lines.push('', `Verification in progress${remaining}. We auto-check every 15s.`);
                if (user?.verificationAmount && user?.walletAddress) {
                    lines.push(`Send EXACTLY ${user.verificationAmount.toFixed ? user.verificationAmount.toFixed(6) : user.verificationAmount} MON from ${user.walletAddress} to ${VERIFICATION_WALLET}.`);
                }
            }

			await interaction.editReply(lines.join('\n'));
		} catch (e) {
			await interaction.editReply({ content: 'Error checking status.', ephemeral: true });
		}
	}
};
