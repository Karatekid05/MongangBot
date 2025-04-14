const { SlashCommandBuilder } = require('discord.js');
const Web3Utils = require('web3-utils');
const User = require('../models/User');
const { checkUserNfts } = require('../utils/monadNftChecker');

// Constantes para verificação
const VERIFICATION_WALLET = "0x8d9a1522114025867BFCCa01E19708def4F23599";
const VERIFICATION_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutos
const VERIFICATION_AMOUNT_MIN = 0.000001;
const VERIFICATION_AMOUNT_MAX = 0.000099;

// Armazenamento temporário para verificações pendentes
const pendingVerifications = new Map();

module.exports = {
    data: new SlashCommandBuilder()
        .setName('registerwallet')
        .setDescription('Register your Monad wallet to receive NFT rewards')
        .addStringOption(option =>
            option.setName('address')
                .setDescription('Your Monad wallet address (starting with 0x)')
                .setRequired(true)),

    async execute(interaction, client) {
        try {
            const walletAddress = interaction.options.getString('address');

            // Verificar que o endereço é válido usando Web3Utils diretamente
            if (!Web3Utils.isAddress(walletAddress)) {
                return interaction.reply({
                    content: 'Invalid wallet address. Please provide a valid Ethereum address starting with 0x.',
                    ephemeral: true
                });
            }

            // Verificar se esta carteira já está registrada para outro usuário
            const existingUser = await User.findOne({
                walletAddress: walletAddress.toLowerCase(),
                userId: { $ne: interaction.user.id }
            });

            if (existingUser) {
                return interaction.reply({
                    content: `This wallet is already registered to another user (${existingUser.username}). Each wallet can only be linked to one Discord account.`,
                    ephemeral: true
                });
            }

            // Get user from database
            let user = await User.findOne({ userId: interaction.user.id });

            if (!user) {
                return interaction.reply({
                    content: 'You need to send a message in a gang channel or join a gang first before registering a wallet.',
                    ephemeral: true
                });
            }

            // Gerar valor de verificação único
            const verificationAmount = (Math.floor(Math.random() * 99) + 1) / 1000000; // 0.000001 a 0.000099

            // Formatação amigável
            const formattedAmount = verificationAmount.toFixed(6);

            // Responder imediatamente com instruções
            await interaction.reply({
                content: `**Wallet Registration Process Started**\n\n` +
                    `To verify you own wallet \`${walletAddress}\`, please send EXACTLY **${formattedAmount} MON** from this wallet to:\n\n` +
                    `\`${VERIFICATION_WALLET}\`\n\n` +
                    `⚠️ **IMPORTANT NOTES:**\n` +
                    `• Send EXACTLY ${formattedAmount} MON (not more, not less)\n` +
                    `• Send from the wallet you're registering (${walletAddress})\n` +
                    `• You have 5 minutes to complete this transaction\n` +
                    `• The bot will automatically check for your transaction\n\n` +
                    `After verification, your NFTs will be checked and rewards calculated automatically.`,
                ephemeral: true
            });

            // Salvar informações de verificação temporariamente
            pendingVerifications.set(interaction.user.id, {
                walletAddress: walletAddress.toLowerCase(),
                verificationAmount,
                timestamp: Date.now(),
                interactionId: interaction.id,
                channelId: interaction.channelId
            });

            // Iniciar a verificação
            setTimeout(async () => {
                await verifyTransaction(interaction.user.id, client);
            }, VERIFICATION_TIMEOUT_MS);

        } catch (error) {
            console.error('Error registering wallet:', error);

            try {
                if (interaction.replied || interaction.deferred) {
                    await interaction.followUp({
                        content: 'There was an error processing your request. Please try again later.',
                        ephemeral: true
                    });
                } else {
                    await interaction.reply({
                        content: 'There was an error processing your request. Please try again later.',
                        ephemeral: true
                    });
                }
            } catch (replyError) {
                console.error('Failed to send error message:', replyError);
            }
        }
    },
};

/**
 * Verificar se a transação foi realizada
 * @param {string} userId - ID do usuário do Discord
 * @param {Client} client - Cliente do Discord.js
 */
async function verifyTransaction(userId, client) {
    // Obter dados de verificação pendente
    const verification = pendingVerifications.get(userId);
    if (!verification) return;

    try {
        // Simular verificação de transação
        // Em um ambiente real, você usaria o código abaixo com a API da Monad
        // (esta função deve ser implementada no arquivo monadNftChecker.js)
        const { success, txHash } = await checkTransactionVerification(
            verification.walletAddress,
            VERIFICATION_WALLET,
            verification.verificationAmount
        );

        // Obter objeto de usuário do Discord
        const discordUser = await client.users.fetch(userId);

        if (success) {
            console.log(`Verification successful for user ${userId}, wallet ${verification.walletAddress}`);

            // Atualizar o usuário na base de dados
            const user = await User.findOne({ userId });
            if (user) {
                user.walletAddress = verification.walletAddress;
                user.walletVerified = true;
                user.verificationTxHash = txHash;
                await user.save();

                // Verificar NFTs após confirmação da carteira
                console.log(`Checking NFTs for verified wallet ${verification.walletAddress}`);
                await checkUserNfts(user);

                // Obter usuário atualizado com contagens de NFT
                const updatedUser = await User.findOne({ userId });

                // Calcular recompensas diárias
                const collection1Reward = updatedUser.nfts.collection1Count * 100;
                const collection2Reward = updatedUser.nfts.collection2Count * 10;
                const totalDailyReward = collection1Reward + collection2Reward;

                // Notificar o usuário
                await discordUser.send(
                    `✅ **Wallet Verification Successful!**\n\n` +
                    `Your wallet \`${verification.walletAddress}\` has been verified and linked to your Discord account.\n\n` +
                    `**NFTs Found:**\n` +
                    `• Collection 1: ${updatedUser.nfts.collection1Count} NFTs (${collection1Reward} $CASH/day)\n` +
                    `• Collection 2: ${updatedUser.nfts.collection2Count} NFTs (${collection2Reward} $CASH/day)\n\n` +
                    `**Total Daily Reward:** ${totalDailyReward} $CASH\n\n` +
                    `You will now automatically receive these rewards every day!`
                );
            }
        } else {
            console.log(`Verification failed for user ${userId}, wallet ${verification.walletAddress}`);

            // Notificar o usuário sobre a falha
            await discordUser.send(
                `❌ **Wallet Verification Failed**\n\n` +
                `We could not verify your transaction of ${verification.verificationAmount} MON from wallet \`${verification.walletAddress}\` to \`${VERIFICATION_WALLET}\`.\n\n` +
                `Possible reasons:\n` +
                `• The transaction was not sent\n` +
                `• The exact amount was not sent\n` +
                `• The transaction was sent from a different wallet\n` +
                `• The transaction was not confirmed within the 5-minute timeframe\n\n` +
                `Please try again with /registerwallet command.`
            );
        }
    } catch (error) {
        console.error(`Error verifying transaction for user ${userId}:`, error);
    } finally {
        // Limpar os dados de verificação
        pendingVerifications.delete(userId);
    }
}

/**
 * Verificar se uma transação específica foi realizada
 * @param {string} fromAddress - Endereço de origem
 * @param {string} toAddress - Endereço de destino
 * @param {number} exactAmount - Valor exato da transação
 * @returns {Promise<{success: boolean, txHash: string}>}
 */
async function checkTransactionVerification(fromAddress, toAddress, exactAmount) {
    try {
        // IMPORTANTE: Esta é uma simulação!
        // Em um ambiente real, você consultaria a blockchain Monad para verificar
        // se existe uma transação com valores específicos

        // Simulação: 80% chance de sucesso para testes
        const randomSuccess = Math.random() < 0.8;

        // Simulação de hash de transação
        const mockTxHash = "0x" + [...Array(64)].map(() => Math.floor(Math.random() * 16).toString(16)).join("");

        console.log(`Simulation: Checking transaction from ${fromAddress} to ${toAddress} of ${exactAmount} MON`);
        console.log(`Simulation result: ${randomSuccess ? "Transaction found" : "No transaction found"}`);

        // Em um ambiente real, você usaria código como:
        /*
        const provider = new ethers.providers.JsonRpcProvider(process.env.MONAD_RPC_URL);
        
        // Obter transações recentes para o endereço de destino
        // (Aqui você precisaria de um provedor que ofereça API de histórico de transações)
        const transactions = await getRecentTransactions(toAddress);
        
        // Verificar se alguma transação corresponde aos critérios
        for (const tx of transactions) {
            if (
                tx.from.toLowerCase() === fromAddress.toLowerCase() &&
                tx.to.toLowerCase() === toAddress.toLowerCase() &&
                Math.abs(parseFloat(ethers.utils.formatEther(tx.value)) - exactAmount) < 0.0000001
            ) {
                return { success: true, txHash: tx.hash };
            }
        }
        
        return { success: false, txHash: null };
        */

        // Para a simulação, retornamos:
        return {
            success: randomSuccess,
            txHash: randomSuccess ? mockTxHash : null
        };
    } catch (error) {
        console.error('Error checking transaction verification:', error);
        return { success: false, txHash: null };
    }
} 