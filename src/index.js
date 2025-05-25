require('dotenv').config();
const { Client, GatewayIntentBits, Collection, EmbedBuilder } = require('discord.js');
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
const { isModerator } = require('./utils/permissions');
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

    // Sync NFTs and distribute rewards once a day at 11 PM UTC
    cron.schedule('0 23 * * *', async () => {
        console.log('Starting daily NFT synchronization and rewards distribution at 11 PM UTC...');
        await checkAllUsersNfts();
        await dailyNftRewards(client);
        console.log('NFT synchronization and rewards completed');
    });

    // Schedule weekly snapshot, export and reset on Mondays at 3 AM UTC
    cron.schedule('0 3 * * 1', async () => {
        console.log('Running weekly snapshot task at 3 AM UTC Monday');

        // Export weekly data before reset
        await exportLeaderboards(true, true);

        // Export total leaderboards
        await exportLeaderboards(false);

        // Reset weekly stats
        await resetWeeklyStats();

        console.log('Weekly snapshot, export and reset completed');
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
        // Primeiro, verificamos se o usuário está mudando de gang
        let oldGang = null;
        let newGang = null;

        // Encontrar a gang antiga, se existir
        for (const gang of GANGS) {
            if (oldMember.roles.cache.has(gang.roleId) && !newMember.roles.cache.has(gang.roleId)) {
                oldGang = gang;
            }
        }

        // Encontrar a nova gang, se existir
        for (const gang of GANGS) {
            // Se o usuário não tinha esse role antes e tem agora
            if (!oldMember.roles.cache.has(gang.roleId) && newMember.roles.cache.has(gang.roleId)) {
                newGang = gang;

                // Buscar o usuário no banco de dados
                let user = await User.findOne({ userId: newMember.id });

                if (user) {
                    // Usuário existente mudando de gang
                    console.log(`User ${newMember.user.username} changing gang: ${user.gangId} -> ${gang.roleId}`);

                    // Verifica se realmente é uma mudança de gang (não apenas adição de outro role)
                    if (user.gangId !== gang.roleId) {
                        const previousGangId = user.gangId;

                        // Salvar contribuição atual para a gang antiga
                        if (!user.gangContributions) {
                            user.gangContributions = new Map();
                        }

                        // Armazenar a contribuição atual na gang anterior
                        const currentContribution = user.gangContributions.get(previousGangId) || 0;
                        user.gangContributions.set(previousGangId, currentContribution + user.cash);

                        console.log(`Stored ${user.cash} $CASH as contribution to previous gang ${previousGangId}`);

                        // Atualizar a gang nos dados do usuário
                        user.previousGangId = previousGangId;
                        user.gangId = gang.roleId;

                        // Salvar as alterações
                        await user.save();

                        console.log(`Gang updated for ${newMember.user.username}: ${gang.name}`);

                        // Atualizar os totais das duas gangs
                        await updateGangTotals(previousGangId);
                        await updateGangTotals(gang.roleId);
                    }
                } else {
                    // Criar novo usuário
                    user = new User({
                        userId: newMember.id,
                        username: newMember.user.username,
                        gangId: gang.roleId,
                        cash: 0,
                        weeklyCash: 0,
                        lastMessageReward: new Date(0),
                        gangContributions: new Map()
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
    if (interaction.isCommand()) {
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
    } else if (interaction.isButton()) {
        // Handle button interactions
        const { customId } = interaction;

        if (customId === 'user_help') {
            handleUserHelpButton(interaction);
        } else if (customId === 'mod_help') {
            handleModeratorHelpButton(interaction);
        }
    }
});

/**
 * Handle the User Help button click
 * @param {ButtonInteraction} interaction 
 */
async function handleUserHelpButton(interaction) {
    const { NFT_COLLECTION1_DAILY_REWARD, NFT_COLLECTION2_DAILY_REWARD, ADDITIONAL_CHAT_CHANNELS, MESSAGE_COOLDOWN_MS } = require('./utils/constants');
    const cooldownSeconds = MESSAGE_COOLDOWN_MS / 1000;

    const userHelpEmbed = new EmbedBuilder()
        .setColor('#3498DB')
        .setTitle('MonGang Bot - User Guide')
        .setDescription('Here\'s everything you need to know about using the MonGang Bot!')
        .addFields(
            {
                name: '💬 Earning $CASH from Chat',
                value: `Send messages in your gang's channel, newbies chat, or general chat to earn 10 $CASH per message. There's a ${cooldownSeconds}-second cooldown between rewarded messages.`
            },
            {
                name: '🖼️ NFT Rewards',
                value: `If you own NFTs, you'll earn fixed daily rewards automatically:\n` +
                    `• Collection 1: ${NFT_COLLECTION1_DAILY_REWARD} $CASH daily (any quantity of NFTs)\n` +
                    `• Collection 2: ${NFT_COLLECTION2_DAILY_REWARD} $CASH daily (any quantity of NFTs)\n` +
                    `Maximum daily reward is ${NFT_COLLECTION1_DAILY_REWARD + NFT_COLLECTION2_DAILY_REWARD} $CASH\n` +
                    `Rewards are sent at 11 PM UTC`
            },
            {
                name: '👛 Register Your Wallet',
                value: 'Use `/registerwallet address:0x...` to connect your wallet and receive NFT rewards'
            },
            {
                name: '📋 Check Your Profile',
                value: 'Use `/profile` to see your stats, NFT holdings, and total $CASH'
            },
            {
                name: '🏆 Leaderboards',
                value: 'Use `/leaderboard type:[Members/Gangs/Your Gang] weekly:[true/false]` to see who\'s on top'
            },
            {
                name: '💸 Give $CASH to Others',
                value: 'Use `/give user:@username amount:50` to give some of your $CASH to another user'
            },
            {
                name: '❓ Getting Help',
                value: 'Use `/help` anytime to see this guide again'
            }
        )
        .setFooter({ text: 'MonGang Bot • User Guide' })
        .setTimestamp();

    await interaction.reply({ embeds: [userHelpEmbed], ephemeral: true });
}

/**
 * Handle the Moderator Help button click
 * @param {ButtonInteraction} interaction 
 */
async function handleModeratorHelpButton(interaction) {
    // Check if user is a moderator
    if (!isModerator(interaction.member)) {
        return interaction.reply({
            content: 'This guide is only available to moderators. Please use the User Guide instead.',
            ephemeral: true
        });
    }

    const modHelpEmbed = new EmbedBuilder()
        .setColor('#E74C3C')
        .setTitle('MonGang Bot - Moderator Guide')
        .setDescription('Administration commands and features for moderators only.')
        .addFields(
            {
                name: '💰 Award $CASH',
                value: '`/award user:@user source:[Games/Memes/Chat/Others] amount:100`\n' +
                    'Award $CASH to users for various activities. The source parameter helps with tracking.'
            },
            {
                name: '❌ Remove $CASH',
                value: '`/remove user:@user amount:50`\n' +
                    'Remove $CASH from a user if needed.'
            },
            {
                name: '🏆 Trophy Management',
                value: '`/awardtrophy gang:[Gang Name]` - Award a trophy to a gang\n' +
                    '`/removetrophy gang:[Gang Name]` - Remove a trophy from a gang'
            },
            {
                name: '📊 Exporting Data',
                value: '`/export-leaderboards weekly:[true/false]`\n' +
                    'Export leaderboards to Google Sheets. Use the weekly flag to choose between weekly and all-time stats.'
            },
            {
                name: '🔄 Weekly Stats Reset',
                value: '`/reset`\n' +
                    'Reset weekly stats and export data. This happens automatically on Sundays at midnight, but can be triggered manually.'
            },
            {
                name: '🖼️ NFT Management',
                value: '`/updatenft user:@user collection1:2 collection2:5`\n' +
                    'Manually update a user\'s NFT holdings if needed. Note that users now receive fixed rewards regardless of the quantity of NFTs they hold.\n\n' +
                    '`/syncnfts user:@user`\n' +
                    'Sync NFT holdings from the blockchain for all users or a specific user. This happens automatically daily at 11 PM UTC.'
            },
            {
                name: '⚙️ Configuration',
                value: 'Most bot settings are in the `.env` file and `src/utils/constants.js`. For major changes, a developer should be consulted.'
            }
        )
        .setFooter({ text: 'MonGang Bot • Moderator Guide' })
        .setTimestamp();

    await interaction.reply({ embeds: [modHelpEmbed], ephemeral: true });
}

client.on('messageCreate', async message => {
    // Ignore messages from bots
    if (message.author.bot) return;

    // Handle message points
    await handleMessagePoints(message);
});

// Login to Discord
client.login(process.env.DISCORD_TOKEN); 