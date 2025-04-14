const User = require('../models/User');
const Gang = require('../models/Gang');
const { POINTS_PER_MESSAGE, MESSAGE_COOLDOWN_MS, GANGS } = require('./constants');

/**
 * Handle message points - award points for messages in gang channels
 * @param {Message} message - Discord message object
 */
async function handleMessagePoints(message) {
    try {
        // Check if the message is in a gang channel
        const gangChannel = GANGS.find(gang => gang.channelId === message.channel.id);
        if (!gangChannel) return;

        // Get user info
        const userId = message.author.id;

        // Find or create user
        let user = await User.findOne({ userId });

        if (!user) {
            // Fetch Discord member to check roles
            const member = await message.guild.members.fetch(userId).catch(err => {
                console.error(`Could not fetch member ${userId}:`, err);
                return null;
            });

            if (!member) return; // Could not fetch member

            // Check all gangs to find one the user belongs to
            let userGang = GANGS.find(gang => member.roles.cache.has(gang.roleId));

            // If user doesn't belong to any gang, check current channel
            if (!userGang) {
                // Automatically assign the gang of the channel where the message was sent
                userGang = gangChannel;

                // If possible, add the role to the user (if we have permission)
                try {
                    await member.roles.add(userGang.roleId);
                    console.log(`Role ${userGang.name} added to ${member.user.username}`);
                } catch (roleErr) {
                    console.error(`Could not add role ${userGang.name} to ${member.user.username}:`, roleErr);
                    // Continue even without being able to add the role
                }
            }

            if (!userGang) return; // User doesn't belong to any gang

            // Create new user
            user = new User({
                userId,
                username: message.author.username,
                gangId: userGang.roleId,
                cash: 0,
                weeklyCash: 0,
                lastMessageReward: new Date(0), // Set initial date in the past
                nfts: {
                    collection1Count: 0,
                    collection2Count: 0
                },
                pointsBySource: {
                    games: 0,
                    memesAndArt: 0,
                    chatActivity: 0,
                    others: 0,
                    nftRewards: 0
                }
            });

            try {
                await user.save();
                console.log(`New user registered: ${message.author.username} in gang ${userGang.name}`);
            } catch (saveError) {
                console.error(`Error saving new user ${message.author.username}:`, saveError);
                return; // Exit if we can't save the user
            }
        }

        // Check cooldown
        const now = new Date();
        if (user.lastMessageReward && now - user.lastMessageReward < MESSAGE_COOLDOWN_MS) {
            return; // Message is on cooldown, don't award points
        }

        // Award points
        user.cash += POINTS_PER_MESSAGE;
        user.weeklyCash += POINTS_PER_MESSAGE;
        user.pointsBySource.chatActivity += POINTS_PER_MESSAGE;
        user.lastMessageReward = now;

        // Save user
        try {
            await user.save();
        } catch (saveError) {
            console.error(`Error saving points for ${message.author.username}:`, saveError);
            return;
        }

        // Update gang totals
        try {
            await updateGangTotals(user.gangId);
        } catch (gangError) {
            console.error(`Error updating gang totals:`, gangError);
        }

    } catch (error) {
        console.error('Error handling message points:', error);
    }
}

/**
 * Award cash to a user
 * @param {string} userId - Discord user ID
 * @param {string} source - Source of the award (games, memesAndArt, chatActivity, others)
 * @param {number} amount - Amount to award
 */
async function awardCash(userId, source, amount) {
    try {
        // Find user
        const user = await User.findOne({ userId });
        if (!user) return false;

        // Award points
        user.cash += amount;
        user.weeklyCash += amount;

        // Track the source
        if (source && user.pointsBySource[source] !== undefined) {
            user.pointsBySource[source] += amount;
        } else {
            user.pointsBySource.others += amount;
        }

        // Save user
        await user.save();

        // Update gang totals
        await updateGangTotals(user.gangId);

        return true;
    } catch (error) {
        console.error('Error awarding cash:', error);
        return false;
    }
}

/**
 * Remove cash from a user
 * @param {string} userId - Discord user ID
 * @param {number} amount - Amount to remove
 */
async function removeCash(userId, amount) {
    try {
        // Find user
        const user = await User.findOne({ userId });
        if (!user) return false;

        // Remove points (don't go below 0)
        user.cash = Math.max(0, user.cash - amount);
        user.weeklyCash = Math.max(0, user.weeklyCash - amount);

        // Save user
        await user.save();

        // Update gang totals
        await updateGangTotals(user.gangId);

        return true;
    } catch (error) {
        console.error('Error removing cash:', error);
        return false;
    }
}

/**
 * Award a trophy to a gang
 * @param {string} gangId - Gang role ID
 */
async function awardTrophy(gangId) {
    try {
        // Find gang
        const gang = await Gang.findOne({ roleId: gangId });
        if (!gang) return false;

        // Award trophy
        gang.trophies += 1;

        // Save gang
        await gang.save();

        return true;
    } catch (error) {
        console.error('Error awarding trophy:', error);
        return false;
    }
}

/**
 * Remove a trophy from a gang
 * @param {string} gangId - Gang role ID
 */
async function removeTrophy(gangId) {
    try {
        // Find gang
        const gang = await Gang.findOne({ roleId: gangId });
        if (!gang) return false;

        // Remove trophy (don't go below 0)
        gang.trophies = Math.max(0, gang.trophies - 1);

        // Save gang
        await gang.save();

        return true;
    } catch (error) {
        console.error('Error removing trophy:', error);
        return false;
    }
}

/**
 * Update gang total cash based on members
 * @param {string} gangId - Gang role ID
 */
async function updateGangTotals(gangId) {
    try {
        // Get all members in the gang
        const users = await User.find({ gangId });

        // Calculate totals
        const totalCash = users.reduce((sum, user) => sum + user.cash, 0);
        const weeklyTotalCash = users.reduce((sum, user) => sum + user.weeklyCash, 0);

        // Update gang
        await Gang.findOneAndUpdate(
            { roleId: gangId },
            { totalCash, weeklyTotalCash }
        );
    } catch (error) {
        console.error('Error updating gang totals:', error);
    }
}

// Reset weekly stats
async function resetWeeklyStats() {
    try {
        // Reset user weekly stats
        await User.updateMany({}, { weeklyCash: 0 });

        // Reset gang weekly stats
        await Gang.updateMany({}, { weeklyTotalCash: 0 });

        return true;
    } catch (error) {
        console.error('Error resetting weekly stats:', error);
        return false;
    }
}

module.exports = {
    handleMessagePoints,
    awardCash,
    removeCash,
    awardTrophy,
    removeTrophy,
    updateGangTotals,
    resetWeeklyStats
}; 