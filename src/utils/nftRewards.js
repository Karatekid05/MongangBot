const User = require('../models/User');
const { NFT_COLLECTION1_DAILY_REWARD, NFT_COLLECTION2_DAILY_REWARD } = require('./constants');
const { isModerator } = require('./permissions');

// Role IDs para membros da equipe que não devem ganhar recompensas
const FOUNDER_ROLE_ID = '1339293248308641883'; // Apenas Founders não recebem recompensas

/**
 * Calculates and distributes daily rewards for NFT holders
 * @param {Object} client - Discord client
 */
async function dailyNftRewards(client) {
  try {
    console.log('Starting distribution of daily NFT rewards...');

    // Find all users with NFTs
    const users = await User.find({
      $or: [
        { 'nfts.collection1Count': { $gt: 0 } },
        { 'nfts.collection2Count': { $gt: 0 } }
      ]
    });

    console.log(`Found ${users.length} users with NFTs`);

    // Get guild to check for team members
    const guild = client.guilds.cache.first();
    if (!guild) {
      console.error('Could not find Discord guild to check roles');
      return { success: 0, failed: 0, skipped: 0, total: 0, rewards: 0 };
    }

    // Distribute rewards
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
        // Check if the user is a founder
        let isFounder = false;

        try {
          const member = await guild.members.fetch(user.userId);
          isFounder = member.roles.cache.has(FOUNDER_ROLE_ID);

          if (isFounder) {
            console.log(`User ${user.username} is a founder and won't earn NFT rewards.`);
            results.skipped++;
            continue; // Skip to next user
          }
        } catch (memberError) {
          console.warn(`Could not check roles for ${user.username}: ${memberError.message}`);
          // Continue with rewards since we can't verify roles
        }

        // Calculate fixed rewards based on NFT ownership
        // Fixed reward of 500 $CASH for owning any number of NFTs from collection 1
        const collection1Reward = user.nfts.collection1Count > 0 ? NFT_COLLECTION1_DAILY_REWARD : 0;
        // Fixed reward of 100 $CASH for owning any number of NFTs from collection 2
        const collection2Reward = user.nfts.collection2Count > 0 ? NFT_COLLECTION2_DAILY_REWARD : 0;
        const dailyReward = collection1Reward + collection2Reward;

        if (dailyReward > 0) {
          // Add rewards to user's balance
          user.cash += dailyReward;
          user.weeklyCash += dailyReward;
          user.pointsBySource.nftRewards += dailyReward;

          // Save changes
          await user.save();

          totalRewards += dailyReward;
          results.success++;
          results.rewards += dailyReward;

          console.log(`NFT rewards awarded to ${user.username}: +${dailyReward} $CASH (${collection1Reward} from coll1, ${collection2Reward} from coll2)`);

          // Send a message to the user about rewards (optional)
          try {
            const discordUser = await client.users.fetch(user.userId);
            await discordUser.send(
              `You received ${dailyReward} $CASH as daily reward for your NFTs:\n` +
              `• Collection 1: ${user.nfts.collection1Count > 0 ? `${NFT_COLLECTION1_DAILY_REWARD} $CASH` : "0 $CASH"}\n` +
              `• Collection 2: ${user.nfts.collection2Count > 0 ? `${NFT_COLLECTION2_DAILY_REWARD} $CASH` : "0 $CASH"}\n\n` +
              `Your current balance: ${user.cash} $CASH`
            );
          } catch (dmError) {
            console.warn(`Could not send DM to ${user.username}:`, dmError.message);
          }
        }
      } catch (userError) {
        console.error(`Error processing rewards for ${user.username}:`, userError);
        results.failed++;
      }
    }

    console.log(`NFT rewards distributed: ${results.success} users, ${results.skipped} skipped (founders), ${results.rewards} $CASH total`);
    return results;
  } catch (error) {
    console.error('Error distributing NFT rewards:', error);
    throw error;
  }
}

/**
 * Updates a user's NFT holdings
 * @param {Object} user - User document in MongoDB
 * @param {Object} nftCounts - NFT counts by collection
 */
async function updateNftHoldings(user, nftCounts) {
  try {
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