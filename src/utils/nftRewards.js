const User = require('../models/User');
const { NFT_COLLECTION1_DAILY_REWARD, NFT_COLLECTION2_DAILY_REWARD } = require('./constants');
const { isModerator } = require('./permissions');

// Role IDs para membros da equipe que não devem ganhar recompensas
// Deve ser idêntico ao definido em pointsManager.js e permissions.js
const TEAM_ROLE_IDS = [
  '1339293248308641883', // Founders
  '1338993206112817283'  // Moderators
];

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

    // Get guild to check for team members
    const guild = client.guilds.cache.first();
    if (!guild) {
      console.error('Could not find Discord guild to check roles');
      return { success: 0, failed: 0, skipped: 0, total: 0, rewards: 0 };
    }

    // Distribuir recompensas
    let totalRewards = 0;
    const results = {
      success: 0,
      failed: 0,
      skipped: 0,
      total: users.length,
      rewards: 0
    };

    for (const user of users) {
      try {
        // Check if the user is a team member (Founder or Moderator)
        let isTeamMember = false;
        let isModeratorCheck = false;

        try {
          const member = await guild.members.fetch(user.userId);

          // Usar ambos os métodos de verificação para garantir consistência
          isTeamMember = TEAM_ROLE_IDS.some(roleId => member.roles.cache.has(roleId));
          isModeratorCheck = isModerator(member);

          if (isTeamMember || isModeratorCheck) {
            console.log(`User ${user.username} is a team member and won't earn NFT rewards. Role check: ${isTeamMember}, Mod check: ${isModeratorCheck}`);
            results.skipped++;
            continue; // Skip to next user
          }
        } catch (memberError) {
          console.warn(`Could not check team roles for ${user.username}: ${memberError.message}`);
          // Continue with rewards since we can't verify roles
        }

        // Calcular recompensas fixas baseadas na presença de NFTs
        // Recompensa fixa de 500 $CASH por ter qualquer quantidade de NFTs da coleção 1
        const collection1Reward = user.nfts.collection1Count > 0 ? NFT_COLLECTION1_DAILY_REWARD : 0;
        // Recompensa fixa de 100 $CASH por ter qualquer quantidade de NFTs da coleção 2
        const collection2Reward = user.nfts.collection2Count > 0 ? NFT_COLLECTION2_DAILY_REWARD : 0;
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

          console.log(`NFT rewards awarded to ${user.username}: +${dailyReward} $CASH (${collection1Reward} from coll1, ${collection2Reward} from coll2)`);

          // Enviar mensagem ao usuário sobre as recompensas (opcional)
          try {
            const discordUser = await client.users.fetch(user.userId);
            await discordUser.send(
              `Você recebeu ${dailyReward} $CASH como recompensa diária pelos seus NFTs:\n` +
              `• Coleção 1: ${user.nfts.collection1Count > 0 ? `${NFT_COLLECTION1_DAILY_REWARD} $CASH` : "0 $CASH"}\n` +
              `• Coleção 2: ${user.nfts.collection2Count > 0 ? `${NFT_COLLECTION2_DAILY_REWARD} $CASH` : "0 $CASH"}\n\n` +
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

    console.log(`Recompensas de NFT distribuídas: ${results.success} usuários, ${results.skipped} pulados (equipe), ${results.rewards} $CASH total`);
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