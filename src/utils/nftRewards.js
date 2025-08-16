const User = require('../models/User');
const { NFT_COLLECTION1_DAILY_REWARD, NFT_COLLECTION2_DAILY_REWARD } = require('./constants');
const { isModerator } = require('./permissions');
const { updateWeeklyCash, updateGangTotals } = require('./pointsManager');
// const { checkUserNfts } = require('./monadNftChecker'); // Disabled: no more RPC NFT checks

// Role IDs para membros da equipe que não devem ganhar recompensas
const FOUNDER_ROLE_ID = '1339293248308641883'; // Apenas Founders não recebem recompensas

/**
 * Calculates and distributes daily rewards for NFT holders
 * @param {Object} client - Discord client
 * @param {Object} [options]
 * @param {boolean} [options.notify=true] - If false, do not DM users
 */
async function dailyNftRewards(client, options = {}) {
  try {
    console.log('Daily NFT rewards function is deprecated and disabled. Use Matrica role-based rewards.');
    return false;
  } catch (error) {
    console.error('Error in dailyNftRewards (deprecated):', error);
    return false;
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