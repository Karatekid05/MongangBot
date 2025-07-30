const User = require('../models/User');
const Gang = require('../models/Gang');
const { GANGS, getUserGangWithPriority } = require('./constants');

/**
 * Initialize users in the database based on their Discord roles
 * @param {Client} client - Discord.js client
 * @returns {Promise<boolean>} Success of the operation
 */
async function initializeUsers(client) {
    try {
        console.log('Initializing users...');

        // Get the server ID
        const guildId = process.env.DISCORD_GUILD_ID;
        if (!guildId) {
            console.error('DISCORD_GUILD_ID not configured in .env file');
            return false;
        }

        // Get the server
        const guild = await client.guilds.fetch(guildId);
        if (!guild) {
            console.error('Server not found. Check your DISCORD_GUILD_ID');
            return false;
        }

        // Fetch server members (forces cache to be filled)
        console.log('Fetching server members...');
        await guild.members.fetch();
        const members = guild.members.cache;
        console.log(`Found ${members.size} members in the server`);

        // Counter for processed users
        let newUsers = 0;
        let existingUsers = 0;

        // Process each member
        for (const [memberId, member] of members) {
            // Skip bots
            if (member.user.bot) continue;

            // Check if user already exists in the database
            const existingUser = await User.findOne({ userId: memberId });
            if (existingUser) {
                existingUsers++;
                continue; // Skip already registered users
            }

            // Determine the member's gang (with Mad Gang priority)
            let userGang = getUserGangWithPriority(member);

            // If the member doesn't belong to any gang, we continue
            if (!userGang) continue;

            // Create new user
            const newUser = new User({
                userId: memberId,
                username: member.user.username,
                gangId: userGang.roleId,
                cash: 0,
                weeklyCash: 0,
                lastMessageReward: new Date(0) // Past date
            });

            await newUser.save();
            newUsers++;
        }

        console.log(`User initialization completed: ${newUsers} new users added, ${existingUsers} existing users`);
        return true;
    } catch (error) {
        console.error('Error initializing users:', error);
        return false;
    }
}

module.exports = { initializeUsers }; 