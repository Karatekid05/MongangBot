const User = require('../models/User');
const { NFT_COLLECTION1_DAILY_REWARD, NFT_COLLECTION2_DAILY_REWARD } = require('./constants');
const { isModerator } = require('./permissions');
const { updateWeeklyCash, updateGangTotals } = require('./pointsManager');
const { checkUserNfts } = require('./monadNftChecker');

// Role IDs para membros da equipe que não devem ganhar recompensas
const FOUNDER_ROLE_ID = '1339293248308641883'; // Apenas Founders não recebem recompensas

/**
 * Calculates and distributes daily rewards for NFT holders
 * @param {Object} client - Discord client
 */
async function dailyNftRewards(client) {
  try {
    console.log('Starting daily NFT rewards distribution...');
    console.log(`Using reward values: Collection 1: ${NFT_COLLECTION1_DAILY_REWARD}, Collection 2: ${NFT_COLLECTION2_DAILY_REWARD}`);

    // Get all users with NFTs, properly accessing the nfts object
    const users = await User.find({
      $or: [
        { 'nfts.collection1Count': { $gt: 0 } },
        { 'nfts.collection2Count': { $gt: 0 } },
        { walletAddress: { $exists: true, $ne: '' } }
      ]
    });

    console.log(`Found ${users.length} users with wallets and/or NFTs`);

    // Obter a data atual
    const now = new Date();
    // Definir a data como meia-noite do dia atual
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);

    const guild = client.guilds.cache.first();

    for (const user of users) {
      try {
        // Force-refresh c1/c2 before calculating daily rewards (cheap),
        // avoid deep scan here to keep RPC cost low
        if (guild) {
          try { await checkUserNfts(user, guild, { forceRefresh: true, allowDeepScan: false }); } catch {}
        } else {
          try { await checkUserNfts(user, null, { forceRefresh: true, allowDeepScan: false }); } catch {}
        }

        // Skip if user is a founder
        if (user.roles && user.roles.includes('founders')) {
          console.log(`Skipping rewards for founder: ${user.username}`);
          continue;
        }

        // Verificar se o usuário já recebeu recompensas hoje
        if (user.lastNftReward && user.lastNftReward >= today) {
          console.log(`User ${user.username} already received NFT rewards today at ${user.lastNftReward.toISOString()}`);
          continue;
        }

        // Get NFT counts from the nfts object
        const collection1Count = user.nfts?.collection1Count || 0;
        const collection2Count = user.nfts?.collection2Count || 0;

        let totalReward = 0;
        const rewardBreakdown = [];

        // Calculate Collection 1 rewards
        if (collection1Count > 0) {
          const collection1Reward = NFT_COLLECTION1_DAILY_REWARD;  // Fixed reward regardless of count
          totalReward += collection1Reward;
          rewardBreakdown.push(`Collection 1: ${collection1Count} NFT(s) = ${collection1Reward} $CASH`);
        }

        // Calculate Collection 2 rewards
        if (collection2Count > 0) {
          const collection2Reward = NFT_COLLECTION2_DAILY_REWARD;  // Fixed reward regardless of count
          totalReward += collection2Reward;
          rewardBreakdown.push(`Collection 2: ${collection2Count} NFT(s) = ${collection2Reward} $CASH`);
        }

        if (totalReward > 0) {
          console.log(`Processing rewards for ${user.username}: ${totalReward} $CASH`);

          // Initialize weekly points if missing
          if (!user.weeklyPointsBySource) {
            user.weeklyPointsBySource = {
              games: 0,
              memesAndArt: 0,
              chatActivity: 0,
              others: 0,
              nftRewards: 0
            };
          }

          // Update user's cash balance and NFT rewards
          user.cash += totalReward;
          user.pointsBySource.nftRewards += totalReward;
          user.weeklyPointsBySource.nftRewards += totalReward;
          user.weeklyCash =
            (user.weeklyPointsBySource.games || 0) +
            (user.weeklyPointsBySource.memesAndArt || 0) +
            (user.weeklyPointsBySource.chatActivity || 0) +
            (user.weeklyPointsBySource.others || 0) +
            (user.weeklyPointsBySource.nftRewards || 0);
          user.lastNftReward = now;

          // Save changes
          await user.save();

          // Update gang totals
          await updateGangTotals(user.gangId);

          // Send reward notification
          try {
            const member = guild ? await guild.members.fetch(user.userId) : null;
            if (member) {
              const rewardMessage = `🎉 Daily NFT Rewards\n\n${rewardBreakdown.join('\n')}\nTotal: ${totalReward} $CASH\n\nRewards are distributed daily at 11 PM UTC`;
              await member.send(rewardMessage);
              console.log(`Reward notification sent to ${user.username}`);
            }
          } catch (dmError) {
            console.log(`Could not DM user ${user.username}: ${dmError.message}`);
          }

          console.log(`Rewarded ${user.username} with ${totalReward} $CASH (${rewardBreakdown.join(', ')})`);
        }
      } catch (userError) {
        console.error(`Error processing rewards for user ${user.username}:`, userError);
      }
    }

    console.log('Daily NFT rewards distribution completed');
  } catch (error) {
    console.error('Error in dailyNftRewards:', error);
  }
}

/**
 * Updates a user's NFT holdings
 * @param {Object} user - User document in MongoDB
 * @param {Object} nftCounts - NFT counts by collection
 */
async function updateNftHoldings(user, nftCounts) {
  try {
    // Ensure nfts object exists
    if (!user.nfts) {
      user.nfts = {};
    }

    // Update NFT counts
    user.nfts.collection1Count = nftCounts.collection1Count || 0;
    user.nfts.collection2Count = nftCounts.collection2Count || 0;

    // Save changes
    await user.save();

    return {
      collection1Count: user.nfts.collection1Count,
      collection2Count: user.nfts.collection2Count
    };
  } catch (error) {
    console.error(`Error updating NFT holdings for ${user.username}:`, error);
    throw error;
  }
}

module.exports = {
  dailyNftRewards,
  updateNftHoldings
}; 