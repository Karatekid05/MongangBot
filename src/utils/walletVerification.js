const Web3Utils = require('web3-utils');
const User = require('../models/User');
const { checkUserNfts } = require('./monadNftChecker');

const VERIFICATION_WALLET = process.env.VERIFICATION_WALLET || '0x8d9a1522114025867BFCCa01E19708def4F23599';
const VERIFICATION_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
const VERIFICATION_AMOUNT_MIN = 0.000001;
const VERIFICATION_AMOUNT_MAX = 0.000099;

// In-memory pending verifications
const pendingVerifications = new Map();

function generateVerificationAmount() {
	const v = (Math.floor(Math.random() * 99) + 1) / 1000000; // 0.000001..0.000099
	return Number(v.toFixed(6));
}

function formatAmount(amount) {
	return Number(amount).toFixed(6);
}

async function startWalletVerification(interaction, client, walletAddressRaw) {
	const walletAddress = walletAddressRaw?.trim();
	if (!Web3Utils.isAddress(walletAddress)) {
		await interaction.editReply({ content: 'Invalid wallet address. Please provide a valid address starting with 0x.', ephemeral: true });
		return { ok: false, reason: 'invalid_address' };
	}

	// Ensure unique per user
	const existingUser = await User.findOne({ walletAddress: walletAddress.toLowerCase(), userId: { $ne: interaction.user.id } });
	if (existingUser) {
		await interaction.editReply({ content: `This wallet is already registered to another user (${existingUser.username}).`, ephemeral: true });
		return { ok: false, reason: 'address_in_use' };
	}

	// Ensure user exists
	let user = await User.findOne({ userId: interaction.user.id });
	if (!user) {
		await interaction.editReply({ content: 'You need to be registered in the system first. Send a message in a gang channel to initialize your profile.', ephemeral: true });
		return { ok: false, reason: 'no_user' };
	}

	const verificationAmount = generateVerificationAmount();
	const formattedAmount = formatAmount(verificationAmount);

	await interaction.editReply({
		content: `Wallet verification started.\n\nSend EXACTLY ${formattedAmount} MON from ${walletAddress} to:\n\n${VERIFICATION_WALLET}\n\nYou have 5 minutes. The bot will verify automatically.`,
		ephemeral: true
	});

	pendingVerifications.set(interaction.user.id, {
		walletAddress: walletAddress.toLowerCase(),
		verificationAmount,
		timestamp: Date.now(),
		interactionId: interaction.id,
		channelId: interaction.channelId
	});

	setTimeout(async () => {
		await verifyTransactionAndFinalize(interaction.user.id, client);
	}, VERIFICATION_TIMEOUT_MS);

	return { ok: true, amount: formattedAmount };
}

async function verifyTransactionAndFinalize(userId, client) {
	const verification = pendingVerifications.get(userId);
	if (!verification) return;
	try {
		const { success, txHash } = await require('./monadNftChecker').checkTransactionVerification(
			verification.walletAddress,
			VERIFICATION_WALLET,
			verification.verificationAmount
		);

		const discordUser = await client.users.fetch(userId);
		if (success) {
			const user = await User.findOne({ userId });
			if (user) {
				user.walletAddress = verification.walletAddress;
				user.walletVerified = true;
				user.verificationTxHash = txHash;
				await user.save();
				await checkUserNfts(user);
				const updatedUser = await User.findOne({ userId });
				await discordUser.send(`✅ Wallet verified and linked: ${verification.walletAddress}. NFTs — Collection1: ${updatedUser.nfts?.collection1Count || 0}, Collection2: ${updatedUser.nfts?.collection2Count || 0}.`);
			}
		} else {
			await discordUser.send(`❌ Wallet verification failed for ${verification.walletAddress}. Please try again.`);
		}
	} catch (e) {
		console.error('verifyTransactionAndFinalize error:', e);
	} finally {
		pendingVerifications.delete(userId);
	}
}

async function getUserNftStatus(userId) {
	const user = await User.findOne({ userId });
	if (!user || !user.walletAddress) return { hasWallet: false };
	return {
		hasWallet: true,
		walletAddress: user.walletAddress,
		c1: user.nfts?.collection1Count || 0,
		c2: user.nfts?.collection2Count || 0
	};
}

module.exports = {
	startWalletVerification,
	getUserNftStatus,
	VERIFICATION_WALLET
};
