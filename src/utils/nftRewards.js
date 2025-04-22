const User = require('../models/User');
const { DAILY_REWARD_COLLECTION1, DAILY_REWARD_COLLECTION2 } = require('./constants');
const { isModerator } = require('./permissions');
const { updateWeeklyCash } = require('./pointsManager');

// Role IDs para membros da equipe que não devem ganhar recompensas
const FOUNDER_ROLE_ID = '1339293248308641883'; // Apenas Founders não recebem recompensas

/**
 * Calculates and distributes daily rewards for NFT holders
 * @param {Object} client - Discord client
 */
async function dailyNftRewards(client) {
  try {
    console.log('Starting daily NFT rewards distribution...');

    // Get all users with NFTs, properly accessing the nfts object
    const users = await User.find({
      $or: [
        { 'nfts.collection1Count': { $gt: 0 } },
        { 'nfts.collection2Count': { $gt: 0 } }
      ]
    });

    console.log(`Found ${users.length} users with NFTs`);

    for (const user of users) {
      try {
        // Skip if user is a founder
        if (user.roles && user.roles.includes('founders')) {
          console.log(`Skipping rewards for founder: ${user.discordId}`);
          continue;
        }

        // Get NFT counts from the nfts object
        const collection1Count = user.nfts?.collection1Count || 0;
        const collection2Count = user.nfts?.collection2Count || 0;

        let totalReward = 0;
        const rewardBreakdown = [];

        // Calculate Collection 1 rewards
        if (collection1Count > 0) {
          const collection1Reward = DAILY_REWARD_COLLECTION1;  // Fixed reward regardless of count
          totalReward += collection1Reward;
          rewardBreakdown.push(`Collection 1: ${collection1Count} NFT(s) = ${collection1Reward} CASH`);
        }

        // Calculate Collection 2 rewards
        if (collection2Count > 0) {
          const collection2Reward = DAILY_REWARD_COLLECTION2;  // Fixed reward regardless of count
          totalReward += collection2Reward;
          rewardBreakdown.push(`Collection 2: ${collection2Count} NFT(s) = ${collection2Reward} CASH`);
        }

        if (totalReward > 0) {
          // Update user's cash balance and NFT rewards using atomic operation
          const updatedUser = await User.findOneAndUpdate(
            { discordId: user.discordId },
            {
              $inc: {
                cash: totalReward,
                'pointsBySource.nftRewards': totalReward,
                'weeklyPointsBySource.nftRewards': totalReward
              },
              $set: { lastNftReward: new Date() }
            },
            { new: true }
          );

          if (!updatedUser) {
            console.log(`User ${user.discordId} not found during reward update`);
            continue;
          }

          // Update weekly cash to reflect all sources
          await updateWeeklyCash(user.discordId);

          // Send reward notification
          const member = await client.guilds.cache.first().members.fetch(user.discordId);
          if (member) {
            const rewardMessage = `🎉 Daily NFT Rewards\n\n${rewardBreakdown.join('\n')}\nTotal: ${totalReward} CASH`;
            try {
              await member.send(rewardMessage);
            } catch (dmError) {
              console.log(`Could not DM user ${user.discordId}: ${dmError.message}`);
            }
          }

          console.log(`Rewarded ${user.discordId} with ${totalReward} CASH (${rewardBreakdown.join(', ')})`);
        }
      } catch (userError) {
        console.error(`Error processing rewards for user ${user.discordId}:`, userError);
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