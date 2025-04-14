const User = require('../models/User');
const { NFT_COLLECTION1_DAILY_REWARD, NFT_COLLECTION2_DAILY_REWARD } = require('./constants');

/**
 * Calcula e distribui recompensas diárias para detentores de NFTs
 * @param {Object} client - Cliente Discord
 */
async function dailyNftRewards(client) {
  try {
    console.log('Iniciando distribuição de recompensas diárias de NFTs...');

    // Encontrar todos os usuários com NFTs
    const users = await User.find({
      $or: [
        { 'nfts.collection1Count': { $gt: 0 } },
        { 'nfts.collection2Count': { $gt: 0 } }
      ]
    });

    console.log(`Encontrados ${users.length} usuários com NFTs`);

    // Distribuir recompensas
    let totalRewards = 0;
    const results = {
      success: 0,
      failed: 0,
      total: users.length,
      rewards: 0
    };

    for (const user of users) {
      try {
        // Calcular recompensas baseadas na quantidade de NFTs
        const collection1Reward = user.nfts.collection1Count * NFT_COLLECTION1_DAILY_REWARD;
        const collection2Reward = user.nfts.collection2Count * NFT_COLLECTION2_DAILY_REWARD;
        const dailyReward = collection1Reward + collection2Reward;

        if (dailyReward > 0) {
          // Adicionar recompensas ao saldo do usuário
          user.cash += dailyReward;
          user.weeklyCash += dailyReward;
          user.pointsBySource.nftRewards += dailyReward;

          // Salvar alterações
          await user.save();

          totalRewards += dailyReward;
          results.success++;
          results.rewards += dailyReward;

          // Enviar mensagem ao usuário sobre as recompensas (opcional)
          try {
            const discordUser = await client.users.fetch(user.userId);
            await discordUser.send(
              `Você recebeu ${dailyReward} $CASH como recompensa diária pelos seus NFTs:\n` +
              `• Coleção 1: ${user.nfts.collection1Count} NFTs (${collection1Reward} $CASH)\n` +
              `• Coleção 2: ${user.nfts.collection2Count} NFTs (${collection2Reward} $CASH)\n\n` +
              `Seu saldo atual: ${user.cash} $CASH`
            );
          } catch (dmError) {
            console.warn(`Não foi possível enviar DM para ${user.username}:`, dmError.message);
          }
        }
      } catch (userError) {
        console.error(`Erro ao processar recompensas para ${user.username}:`, userError);
        results.failed++;
      }
    }

    console.log(`Recompensas de NFT distribuídas: ${results.success} usuários, ${results.rewards} $CASH total`);
    return results;
  } catch (error) {
    console.error('Erro ao distribuir recompensas de NFT:', error);
    throw error;
  }
}

/**
 * Atualiza as posses de NFT de um usuário
 * @param {Object} user - Documento do usuário no MongoDB
 * @param {Object} nftCounts - Contagens de NFT por coleção
 */
async function updateNftHoldings(user, nftCounts) {
  try {
    // Atualizar contagens de NFT
    user.nfts.collection1Count = nftCounts.collection1Count || 0;
    user.nfts.collection2Count = nftCounts.collection2Count || 0;

    // Salvar alterações
    await user.save();

    return {
      collection1Count: user.nfts.collection1Count,
      collection2Count: user.nfts.collection2Count
    };
  } catch (error) {
    console.error(`Erro ao atualizar posses de NFT para ${user.username}:`, error);
    throw error;
  }
}

module.exports = {
  dailyNftRewards,
  updateNftHoldings
}; 