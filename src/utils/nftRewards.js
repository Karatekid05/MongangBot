const User = require('../models/User');

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
        const collection1Reward = user.nfts.collection1Count * 100;
        const collection2Reward = user.nfts.collection2Count * 10;
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
 * Atualiza as posses de NFT de um usuário no banco de dados
 * @param {string} userId - ID do Discord do usuário
 * @param {number} collection1Count - Número de NFTs da coleção 1
 * @param {number} collection2Count - Número de NFTs da coleção 2
 */
async function updateNftHoldings(userId, collection1Count, collection2Count) {
  try {
    // Encontrar e atualizar o usuário
    const user = await User.findOne({ userId });

    if (!user) {
      console.warn(`Usuário ${userId} não encontrado para atualização de NFT`);
      return false;
    }

    // Verificar se houve alteração
    if (
      user.nfts.collection1Count === collection1Count &&
      user.nfts.collection2Count === collection2Count
    ) {
      return false; // Sem alterações
    }

    // Atualizar contagens
    user.nfts.collection1Count = collection1Count;
    user.nfts.collection2Count = collection2Count;

    // Salvar alterações
    await user.save();
    console.log(`NFTs atualizados para ${user.username}: Coleção 1: ${collection1Count}, Coleção 2: ${collection2Count}`);
    return true;
  } catch (error) {
    console.error(`Erro ao atualizar NFTs para ${userId}:`, error);
    return false;
  }
}

module.exports = {
  dailyNftRewards,
  updateNftHoldings
}; 