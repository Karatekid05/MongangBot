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

    // Ensure user exists (auto-create if needed) and persist pending verification info
    let user = await User.findOne({ userId: interaction.user.id });
    if (!user) {
        user = new User({
            userId: interaction.user.id,
            username: interaction.user.username,
            cash: 0,
            weeklyCash: 0,
            pointsBySource: { games: 0, memesAndArt: 0, chatActivity: 0, others: 0, nftRewards: 0 },
            weeklyPointsBySource: { games: 0, memesAndArt: 0, chatActivity: 0, others: 0, nftRewards: 0 },
            nfts: { collection1Count: 0, collection2Count: 0 }
        });
    }

    const verificationAmount = generateVerificationAmount();
    const formattedAmount = formatAmount(verificationAmount);

    // Persist pending verification to DB so we don't lose it on restarts
    try {
        user.walletAddress = walletAddress.toLowerCase();
        user.walletVerified = false;
        user.verificationPending = true;
        user.verificationAmount = verificationAmount;
        user.verificationTimestamp = new Date();
        await user.save();
    } catch {}

	await interaction.editReply({
		content: `Wallet verification started.\n\nSend EXACTLY ${formattedAmount} MON from ${walletAddress} to:\n\n${VERIFICATION_WALLET}\n\nYou have 5 minutes. After sending, use 'Check Status' to confirm.`,
		ephemeral: true
	});

	// Set pending verification with polling interval
    const pending = {
		walletAddress: walletAddress.toLowerCase(),
		verificationAmount,
		timestamp: Date.now(),
		deadline: Date.now() + VERIFICATION_TIMEOUT_MS,
        guildId: interaction.guild?.id || null,
		interactionId: interaction.id,
		channelId: interaction.channelId,
		intervalId: null,
		timeoutId: null
	};

	const POLL_INTERVAL_MS = Number(process.env.VERIFICATION_POLL_INTERVAL_MS || 15000);
	// Poll until success or timeout
	pending.intervalId = setInterval(async () => {
		try {
			const ok = await attemptVerifyTransaction(interaction.user.id, client);
			if (ok) {
				clearInterval(pending.intervalId);
				clearTimeout(pending.timeoutId);
				pendingVerifications.delete(interaction.user.id);
			}
		} catch {}
	}, POLL_INTERVAL_MS);

	// Hard timeout handler (no DMs – user will use Check Status button)
	pending.timeoutId = setTimeout(async () => {
		try {
			const ok = await attemptVerifyTransaction(interaction.user.id, client);
			// If not ok, we'll rely on the user pressing Check Status to retry
		} finally {
			clearInterval(pending.intervalId);
			pendingVerifications.delete(interaction.user.id);
		}
	}, VERIFICATION_TIMEOUT_MS);

	pendingVerifications.set(interaction.user.id, pending);

	return { ok: true, amount: formattedAmount };
}

// Attempt a verification check once. Returns true if verified; false otherwise. Does not clear pending state on failure.
async function attemptVerifyTransaction(userId, client) {
    let verification = pendingVerifications.get(userId);
    let fromAddress;
    let exactAmount;
    if (!verification) {
        // Fallback to DB-stored pending data
        const user = await User.findOne({ userId });
        if (!user || !user.verificationPending || !user.walletAddress || !user.verificationAmount) {
            return false;
        }
        fromAddress = user.walletAddress;
        exactAmount = user.verificationAmount;
    } else {
        fromAddress = verification.walletAddress;
        exactAmount = verification.verificationAmount;
    }
	try {
		const { success, txHash } = await require('./monadNftChecker').checkTransactionVerification(
            fromAddress,
			VERIFICATION_WALLET,
            exactAmount
		);

        if (success) {
			const user = await User.findOne({ userId });
			if (user) {
                user.walletAddress = fromAddress;
				user.walletVerified = true;
				user.verificationTxHash = txHash;
                user.verificationPending = false;
                user.verificationAmount = 0;
                user.verificationTimestamp = null;
				await user.save();
                // If we know the guild, pass it so roles can be toggled immediately
                let guild = null;
                try {
                    const pv = pendingVerifications.get(userId);
                    if (pv?.guildId) {
                        guild = await client.guilds.fetch(pv.guildId);
                    }
                } catch {}
                await checkUserNfts(user, guild, { bypassCache: true });
			}

			return true;
		}
	} catch (e) {
		console.error('attemptVerifyTransaction error:', e);
	}
	return false;
}

// Expose a manual trigger for status button
async function triggerVerifyNow(userId, client) {
	return await attemptVerifyTransaction(userId, client);
}

function hasPendingVerification(userId) {
    return pendingVerifications.has(userId);
}

async function getUserNftStatus(userId) {
	const user = await User.findOne({ userId });
	if (!user || !user.walletAddress) return { hasWallet: false, c1: 0, c2: 0 };
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
	VERIFICATION_WALLET,
	triggerVerifyNow,
	hasPendingVerification
};
