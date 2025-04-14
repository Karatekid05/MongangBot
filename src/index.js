require('dotenv').config();
const { Client, GatewayIntentBits, Collection } = require('discord.js');
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const cron = require('node-cron');

const { loadCommands } = require('./handlers/commandHandler');
const { handleMessagePoints, resetWeeklyStats } = require('./utils/pointsManager');
const { dailyNftRewards } = require('./utils/nftRewards');
const { initializeGangs } = require('./utils/initializeGangs');
const { initializeUsers } = require('./utils/initializeUsers');
const { exportLeaderboards } = require('./utils/googleSheets');
const { checkAllUsersNfts } = require('./utils/monadNftChecker');
const { GANGS } = require('./utils/constants');
const User = require('./models/User');
const Gang = require('./models/Gang');

// Create client instance
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.DirectMessages,
        GatewayIntentBits.GuildMessageReactions,
        GatewayIntentBits.DirectMessageReactions,
        GatewayIntentBits.GuildPresences
    ]
});

// Initialize collections
client.commands = new Collection();

// Set unique indexes to prevent duplication
mongoose.connection.on('connected', async () => {
    try {
        const collections = await mongoose.connection.db.listCollections().toArray();
        const collectionNames = collections.map(c => c.name);

        // Ensure unique index for users is created only once
        if (collectionNames.includes('users')) {
            const User = mongoose.model('User');
            await User.collection.createIndex({ userId: 1 }, { unique: true, background: true });
            console.log('Unique index for users created or already exists');
        }

        // Ensure unique index for gangs is created only once
        if (collectionNames.includes('gangs')) {
            const Gang = mongoose.model('Gang');
            await Gang.collection.createIndex({ roleId: 1 }, { unique: true, background: true });
            console.log('Unique index for gangs created or already exists');
        }
    } catch (error) {
        console.error('Error configuring indexes:', error);
    }
});

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI)
    .then(() => {
        console.log('Connected to MongoDB');
        // Initialize gangs and users only after database connection
        initializeGangs().then(() => {
            console.log('Gangs initialized, proceeding to user initialization...');
        });
    })
    .catch(err => console.error('MongoDB connection error:', err));

// Load commands
loadCommands(client);

// Events
client.once('ready', async () => {
    console.log(`Logged in as ${client.user.tag}`);

    // Initialize users based on roles after the bot is ready
    await initializeUsers(client);

    // Sync NFTs every day at 11 PM
    cron.schedule('0 23 * * *', async () => {
        console.log('Starting daily NFT synchronization...');
        await checkAllUsersNfts();
        console.log('NFT synchronization completed');
    });

    // Schedule daily NFT rewards at midnight
    cron.schedule('0 0 * * *', () => {
        console.log('Running daily NFT rewards task');
        dailyNftRewards(client);
    });

    // Schedule weekly reset and export on Sundays at midnight
    cron.schedule('0 0 * * 0', async () => {
        console.log('Running weekly reset task');

        // Export weekly data before reset
        await exportLeaderboards(true, true);

        // Reset weekly stats
        await resetWeeklyStats();

        console.log('Weekly reset completed');
    });
});

// Update username when it changes
client.on('userUpdate', async (oldUser, newUser) => {
    if (oldUser.username !== newUser.username) {
        try {
            await User.updateOne(
                { userId: newUser.id },
                { username: newUser.username }
            );
            console.log(`Username updated: ${oldUser.username} -> ${newUser.username}`);
        } catch (error) {
            console.error('Error updating username:', error);
        }
    }
});

// Update user's gang when roles change
client.on('guildMemberUpdate', async (oldMember, newMember) => {
    if (oldMember.roles.cache.size === newMember.roles.cache.size) return;

    try {
        for (const gang of GANGS) {
            const hadRole = oldMember.roles.cache.has(gang.roleId);
            const hasRole = newMember.roles.cache.has(gang.roleId);

            // If the user received a new gang role
            if (!hadRole && hasRole) {
                let user = await User.findOne({ userId: newMember.id });

                if (user) {
                    // Update existing user's gang
                    user.gangId = gang.roleId;
                    await user.save();
                    console.log(`Gang updated for ${newMember.user.username}: ${gang.name}`);
                } else {
                    // Create new user
                    user = new User({
                        userId: newMember.id,
                        username: newMember.user.username,
                        gangId: gang.roleId,
                        cash: 0,
                        weeklyCash: 0,
                        lastMessageReward: new Date(0)
                    });
                    await user.save();
                    console.log(`New user created for ${newMember.user.username} in gang ${gang.name}`);
                }
            }
        }
    } catch (error) {
        console.error('Error processing role change:', error);
    }
});

client.on('interactionCreate', async interaction => {
    if (!interaction.isCommand()) return;

    const command = client.commands.get(interaction.commandName);
    if (!command) return;

    try {
        await command.execute(interaction, client);
    } catch (error) {
        console.error(`Error executing command ${interaction.commandName}:`, error);

        // Try to respond to the interaction if it hasn't been acknowledged yet
        try {
            if (interaction.deferred || interaction.replied) {
                await interaction.followUp({
                    content: 'There was an error executing this command!',
                    ephemeral: true
                });
            } else {
                await interaction.reply({
                    content: 'There was an error executing this command!',
                    ephemeral: true
                });
            }
        } catch (replyError) {
            console.error('Failed to send error response:', replyError);
        }
    }
});

client.on('messageCreate', async message => {
    // Ignore messages from bots
    if (message.author.bot) return;

    // Handle message points
    await handleMessagePoints(message);
});

// Login to Discord
client.login(process.env.DISCORD_TOKEN); 