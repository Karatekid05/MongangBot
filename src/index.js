require('dotenv').config();
const { Client, GatewayIntentBits, Collection, EmbedBuilder, ActionRowBuilder } = require('discord.js');
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const cron = require('node-cron');

const { loadCommands } = require('./handlers/commandHandler');
const { handleMessagePoints, resetWeeklyStats, updateGangTotals } = require('./utils/pointsManager');
const { dailyNftRewards } = require('./utils/nftRewards');
const { dailySpecialRoleRewards } = require('./utils/dailyRoleRewards');
const { initializeGangs } = require('./utils/initializeGangs');
const { initializeUsers } = require('./utils/initializeUsers');
const { exportLeaderboards } = require('./utils/googleSheets');
const { checkAllUsersNfts } = require('./utils/monadNftChecker');
const { GANGS, MAD_GANG_ROLE_ID, getUserGangWithPriority, getUserGangRoles } = require('./utils/constants');
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

    // Distribute 500 $CASH daily to members with special role at 11:10 PM UTC
    cron.schedule('10 23 * * *', async () => {
        console.log('Starting daily special role rewards distribution at 11:10 PM UTC...');
        await dailySpecialRoleRewards(client);
        console.log('Daily special role rewards completed');
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

    // Schedule leaderboard export to Google Sheets every Sunday at 11 PM UTC
    cron.schedule('0 23 * * 0', async () => {
        console.log('Running scheduled leaderboard export to Google Sheets');

        // Export total leaderboards
        const success = await exportLeaderboards(false);

        if (success) {
            console.log('Successfully exported total leaderboards to Google Sheets');
        } else {
            console.error('Failed to export total leaderboards to Google Sheets');
        }
    });

    // Check ticket time limits and auto-resets every 5 minutes
    cron.schedule('*/5 * * * *', async () => {
        console.log('Checking ticket time limits and auto-resets...');

        try {
            const { checkTimeLimits, checkAndResetTickets } = require('./utils/ticketManager');
            await checkTimeLimits();
            await checkAndResetTickets(client);
        } catch (error) {
            console.error('Error checking ticket limits and resets:', error);
        }
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

// Update user's gang when roles change with Mad Gang priority and exclusivity
client.on('guildMemberUpdate', async (oldMember, newMember) => {
    // Skip if no role changes
    if (oldMember.roles.cache.size === newMember.roles.cache.size) {
        // Check if it's just a role swap (same count but different roles)
        const oldRoles = new Set(oldMember.roles.cache.keys());
        const newRoles = new Set(newMember.roles.cache.keys());
        const hasChanges = [...oldRoles].some(role => !newRoles.has(role)) || 
                          [...newRoles].some(role => !oldRoles.has(role));
        if (!hasChanges) return;
    }

    try {
        console.log(`Processing role change for ${newMember.user.username}`);
        
        // Get old and new gang roles
        const oldGangRoles = getUserGangRoles(oldMember);
        const newGangRoles = getUserGangRoles(newMember);
        
        console.log(`Old gang roles: [${oldGangRoles.join(', ')}], New gang roles: [${newGangRoles.join(', ')}]`);

        // EXCLUSIVE ROLE MANAGEMENT: If user has Mad Gang role, remove all other gang roles
        if (newGangRoles.includes(MAD_GANG_ROLE_ID) && newGangRoles.length > 1) {
            console.log(`User ${newMember.user.username} has Mad Gang + other gang roles. Removing other gang roles...`);
            
            for (const roleId of newGangRoles) {
                if (roleId !== MAD_GANG_ROLE_ID) {
                    try {
                        await newMember.roles.remove(roleId);
                        console.log(`Removed role ${roleId} from ${newMember.user.username} (Mad Gang exclusivity)`);
                    } catch (roleError) {
                        console.error(`Failed to remove role ${roleId} from ${newMember.user.username}:`, roleError);
                    }
                }
            }
            
            // Update the newGangRoles to reflect changes
            const updatedMember = await newMember.guild.members.fetch(newMember.id);
            const finalGangRoles = getUserGangRoles(updatedMember);
            console.log(`Final gang roles after cleanup: [${finalGangRoles.join(', ')}]`);
        }
        
        // If user has multiple non-Mad Gang roles, keep only the first one found
        else if (!newGangRoles.includes(MAD_GANG_ROLE_ID) && newGangRoles.length > 1) {
            console.log(`User ${newMember.user.username} has multiple non-Mad Gang roles. Keeping first one only...`);
            
            const keepRole = newGangRoles[0]; // Keep first role
            for (let i = 1; i < newGangRoles.length; i++) {
                try {
                    await newMember.roles.remove(newGangRoles[i]);
                    console.log(`Removed role ${newGangRoles[i]} from ${newMember.user.username} (exclusivity)`);
                } catch (roleError) {
                    console.error(`Failed to remove role ${newGangRoles[i]} from ${newMember.user.username}:`, roleError);
                }
            }
        }
        
        // Determine current gang with priority system
        const currentGang = getUserGangWithPriority(newMember);
        const oldGang = oldGangRoles.length > 0 ? GANGS.find(g => oldGangRoles.includes(g.roleId)) : null;
        
        // If no gang change, exit
        if (oldGang && currentGang && oldGang.roleId === currentGang.roleId) {
            console.log(`No gang change for ${newMember.user.username}`);
            return;
        }

        // Find or create user in database
        let user = await User.findOne({ userId: newMember.id });

        if (user) {
            // User exists - update gang if changed
            if (currentGang && user.gangId !== currentGang.roleId) {
                console.log(`User ${newMember.user.username} changing gang: ${user.gangId} -> ${currentGang.roleId}`);

                const previousGangId = user.gangId;

                // Save current contribution to old gang
                if (!user.gangContributions) {
                    user.gangContributions = new Map();
                }

                const currentContribution = user.gangContributions.get(previousGangId) || 0;
                user.gangContributions.set(previousGangId, currentContribution + user.cash);

                console.log(`Stored ${user.cash} $CASH as contribution to previous gang ${previousGangId}`);

                // Update user's gang
                user.previousGangId = previousGangId;
                user.gangId = currentGang.roleId;
                await user.save();

                console.log(`Gang updated for ${newMember.user.username}: ${currentGang.name}`);

                // Update gang totals
                await updateGangTotals(previousGangId);
                await updateGangTotals(currentGang.roleId);
            }
            else if (!currentGang) {
                // User no longer has any gang role - remove from database
                console.log(`User ${newMember.user.username} no longer belongs to any gang - removing from database`);
                await User.deleteOne({ _id: user._id });
            }
        } else if (currentGang) {
            // New user with gang role - create in database
            user = new User({
                userId: newMember.id,
                username: newMember.user.username,
                gangId: currentGang.roleId,
                cash: 0,
                weeklyCash: 0,
                lastMessageReward: new Date(0),
                gangContributions: new Map()
            });
            await user.save();
            console.log(`New user created for ${newMember.user.username} in gang ${currentGang.name}`);
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
        } else if (customId === 'ticket_help') {
            handleTicketHelpButton(interaction);
        } else if (customId === 'market_help') {
            handleMarketHelpButton(interaction);
        } else if (customId.startsWith('buy_ticket_')) {
            handleBuyTicketButton(interaction);
        } else if (customId.startsWith('buy_market_')) {
            handleBuyMarketButton(interaction);
        } else if (customId === 'market_buy_item') {
            handleMarketBuyItemButton(interaction);
        } else if (customId === 'market_select_item') {
            handleMarketSelectItem(interaction);
        }
    } else if (interaction.isAutocomplete()) {
        const command = client.commands.get(interaction.commandName);

        if (!command) {
            console.error(`No command matching ${interaction.commandName} was found.`);
            return;
        }

        try {
            await command.autocomplete(interaction);
        } catch (error) {
            console.error(error);
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
                name: '🎫 Ticket System',
                value: 'Buy tickets for events, lotteries, and tournaments:\n' +
                    '• `/tickets` - See available tickets\n' +
                    '• `/buyticket` - Buy tickets for events\n' +
                    '• Automatic role assignment when you buy tickets'
            },
            {
                name: '🛒 Market System',
                value: 'Buy exclusive WL and roles with $CASH:\n' +
                    '• `/market buy` - Buy items from the market\n' +
                    '• Click buttons in market channel\n' +
                    '• Permanent or temporary roles available'
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
                name: '🎫 Ticket System Management',
                value: '`/createticket` - Create new tickets/events\n' +
                    '`/manageticket` - Manage, pause, or delete tickets\n' +
                    '`/drawlottery` - Draw lottery winners\n' +
                    '`/exportparticipants` - Export participant lists'
            },
            {
                name: '🛒 Market System Management',
                value: '`/market setup` - Setup market channel\n' +
                    '`/market add` - Add new market items\n' +
                    '`/market remove` - Remove market items\n' +
                    '`/market list` - List all market items'
            },
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
                    'Export leaderboards to Google Sheets. Use the weekly flag to choose between weekly and all-time stats.\n\n' +
                    '`/exportusers`\n' +
                    'Export all server users to Excel file, organized by role hierarchy (highest roles first).'
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

/**
 * Handle the Ticket System Help button click
 * @param {ButtonInteraction} interaction 
 */
async function handleTicketHelpButton(interaction) {
    const ticketHelpEmbed = new EmbedBuilder()
        .setColor('#27AE60')
        .setTitle('🎫 Ticket System Guide')
        .setDescription('Learn about the ticket/event system for lotteries, tournaments, and special events!')
        .addFields(
            {
                name: '🎮 Types of Events',
                value: '• **Lottery** - Buy numbered tickets, automatic prize distribution\n' +
                    '• **Poker** - Buy-in tournaments with prize pools\n' +
                    '• **Tournament** - General tournaments (Smash, etc.)\n' +
                    '• **Custom** - Any special event with role assignment'
            },
            {
                name: '👤 For Users',
                value: '• `/tickets` - See all available tickets\n' +
                    '• `/buyticket` - Buy tickets (shows interactive list)\n' +
                    '• Automatic role assignment when you buy\n' +
                    '• Lottery winners receive prizes automatically'
            },
            {
                name: '🛡️ For Moderators',
                value: '• `/createticket` - Create new events\n' +
                    '• `/manageticket` - Pause, complete, or delete tickets\n' +
                    '• `/drawlottery` - Draw lottery winners\n' +
                    '• `/exportparticipants` - Export participant lists'
            },
            {
                name: '⏰ Time Limits',
                value: '• Optional time limits for ticket sales\n' +
                    '• When expired, tickets enter "pre-delete" state\n' +
                    '• Moderators can export data or delete when ready'
            },
            {
                name: '💰 Pricing & Prizes',
                value: '• Set custom prices in $CASH\n' +
                    '• Lottery prizes: 1º 50%, 2º 30%, 3º 20%\n' +
                    '• Maximum tickets per user (1-10)\n' +
                    '• Automatic role assignment'
            },
            {
                name: '🗑️ Management',
                value: '• Delete completely (irreversible)\n' +
                    '• Cancel and refund all participants\n' +
                    '• Export participant data\n' +
                    '• Remove roles automatically'
            }
        )
        .setFooter({ text: 'MonGang Bot • Ticket System' })
        .setTimestamp();

    await interaction.reply({ embeds: [ticketHelpEmbed], ephemeral: true });
}

/**
 * Handle the Market Help button click
 * @param {ButtonInteraction} interaction 
 */
async function handleMarketHelpButton(interaction) {
    const marketHelpEmbed = new EmbedBuilder()
        .setColor('#E74C3C')
        .setTitle('🛒 Market System Guide')
        .setDescription('Learn how to use the Mongang Market system!')
        .addFields(
            {
                name: '🛒 What is the Market?',
                value: 'The Market allows you to buy exclusive WL (Whitelist) spots and special roles using your $CASH. Each item gives you a specific role for a set duration.'
            },
            {
                name: '💰 How to Buy',
                value: '• Use `/market buy` to purchase items directly\n' +
                    '• Or click the buttons in the market channel\n' +
                    '• Items are paid with your total $CASH balance\n' +
                    '• You\'ll receive the role immediately after purchase'
            },
            {
                name: '⏰ Role Duration',
                value: '• **Permanent roles:** You keep the role forever\n' +
                    '• **Temporary roles:** Automatically removed after the set time\n' +
                    '• You\'ll be notified when temporary roles expire'
            },
            {
                name: '📋 Available Commands',
                value: '• `/market buy` - Buy an item from the market\n' +
                    '• `/market list` - See all available items (Moderators only)\n' +
                    '• `/market add` - Add new items (Moderators only)\n' +
                    '• `/market remove` - Remove items (Moderators only)\n' +
                    '• `/market setup` - Setup market channel (Moderators only)'
            },
            {
                name: '🔍 Checking Your Balance',
                value: 'Use `/profile` to see your current $CASH balance before making purchases.'
            },
            {
                name: '📝 Purchase Logs',
                value: 'All purchases are logged in a private channel for administrators to track and manage.'
            }
        )
        .setFooter({ text: 'MonGang Bot • Market System' })
        .setTimestamp();

    await interaction.reply({ embeds: [marketHelpEmbed], ephemeral: true });
}

/**
 * Handle the Buy Market Item button click
 * @param {ButtonInteraction} interaction 
 */
async function handleBuyMarketButton(interaction) {
    try {
        await interaction.deferReply({ ephemeral: true });

        const itemId = interaction.customId.replace('buy_market_', '');
        const userId = interaction.user.id;
        const username = interaction.user.username;

        const { buyMarketItem } = require('./utils/marketManager');

        // Buy market item
        const result = await buyMarketItem(itemId, userId, username, interaction.guild);

        if (result.success) {
            // Create success embed
            const embed = new EmbedBuilder()
                .setColor('#00FF00')
                .setTitle('🛒 Purchase Successful!')
                .setDescription(`**${result.itemName}**`)
                .addFields(
                    { name: '👤 Buyer', value: username, inline: true },
                    { name: '💰 Price', value: `${result.price} $CASH`, inline: true },
                    { name: '⏰ Duration', value: result.duration, inline: true }
                )
                .setFooter({ text: 'Market Purchase' })
                .setTimestamp();

            await interaction.editReply({
                content: '✅ Purchase completed successfully!',
                embeds: [embed]
            });
        } else {
            await interaction.editReply({
                content: `❌ ${result.error}`
            });
        }

    } catch (error) {
        console.error('Error buying market item via button:', error);
        await interaction.editReply({
            content: `❌ Error processing purchase: ${error.message}`
        });
    }
}

/**
 * Handle the Market Buy Item button click (shows selector)
 * @param {ButtonInteraction} interaction 
 */
async function handleMarketBuyItemButton(interaction) {
    try {
        await interaction.deferReply({ ephemeral: true });

        const { listMarketItems } = require('./utils/marketManager');
        const marketItems = await listMarketItems();

        if (marketItems.length === 0) {
            return interaction.editReply('❌ No items available in the marketplace.');
        }

        // Create select menu options
        const { StringSelectMenuBuilder, StringSelectMenuOptionBuilder } = require('discord.js');
        const select = new StringSelectMenuBuilder()
            .setCustomId('market_select_item')
            .setPlaceholder('Choose an item to purchase')
            .addOptions(
                marketItems.map(item => {
                    const roleMention = `<@&${item.roleId}>`;
                    const durationText = item.durationHours > 0 ? `${item.durationHours}h` : 'Permanent';
                    return new StringSelectMenuOptionBuilder()
                        .setLabel(`${item.name} - ${item.price} $CASH`)
                        .setDescription(`${roleMention} • ${durationText}`)
                        .setValue(item._id.toString());
                })
            );

        const row = new ActionRowBuilder().addComponents(select);

        await interaction.editReply({
            content: '🛒 **Select an item to purchase:**',
            components: [row]
        });

    } catch (error) {
        console.error('Error showing market selector:', error);
        await interaction.editReply({
            content: `❌ Error loading marketplace items: ${error.message}`
        });
    }
}

/**
 * Handle the Market Select Item interaction
 * @param {StringSelectMenuInteraction} interaction 
 */
async function handleMarketSelectItem(interaction) {
    try {
        await interaction.deferReply({ ephemeral: true });

        const selectedItemId = interaction.values[0];
        const userId = interaction.user.id;
        const username = interaction.user.username;

        const { buyMarketItem } = require('./utils/marketManager');

        // Buy the selected item
        const result = await buyMarketItem(selectedItemId, userId, username, interaction.guild);

        if (result.success) {
            await interaction.editReply({
                content: `✅ **Purchase successful!**\n\n**Item:** ${result.itemName}\n**Price:** ${result.price} $CASH\n**Duration:** ${result.duration}\n\nYou have been assigned the role!`
            });
        } else {
            await interaction.editReply({
                content: `❌ **Purchase failed:** ${result.error}`
            });
        }

    } catch (error) {
        console.error('Error processing market selection:', error);
        await interaction.editReply({
            content: `❌ Error processing purchase: ${error.message}`
        });
    }
}

/**
 * Handle the Buy Ticket button click
 * @param {ButtonInteraction} interaction 
 */
async function handleBuyTicketButton(interaction) {
    try {
        await interaction.deferReply({ ephemeral: true });

        const ticketId = interaction.customId.replace('buy_ticket_', '');
        const userId = interaction.user.id;
        const username = interaction.user.username;
        const quantity = 1; // Default to 1 ticket per button click

        const { buyTickets } = require('./utils/ticketManager');

        // Buy tickets
        const result = await buyTickets(ticketId, userId, username, quantity, interaction.client);

        // Create confirmation embed
        const embed = new EmbedBuilder()
            .setColor('#00FF00')
            .setTitle('🎫 Purchase Successful!')
            .setDescription(`**${result.ticket.name}**`)
            .addFields(
                { name: '👤 Buyer', value: username, inline: true },
                { name: '🎫 Quantity', value: quantity.toString(), inline: true },
                { name: '💰 Total Price', value: `${result.purchase.totalPrice} $CASH`, inline: true },
                { name: '📅 Date', value: result.purchase.purchaseDate.toLocaleString('en-US'), inline: true },
                { name: '🏷️ Role', value: result.ticket.roleName, inline: true },
                { name: '🎮 Type', value: result.ticket.eventType.charAt(0).toUpperCase() + result.ticket.eventType.slice(1), inline: true }
            );

        // Add ticket numbers if lottery
        if (result.ticket.eventType === 'lottery' && result.purchase.ticketNumbers) {
            embed.addFields({
                name: '🎲 Ticket Numbers',
                value: result.purchase.ticketNumbers.join(', '),
                inline: false
            });
        }

        // Add remaining tickets info
        const remainingTickets = result.ticket.getAvailableTickets();
        embed.addFields({
            name: '📊 Remaining Tickets',
            value: `${remainingTickets} of ${result.ticket.maxTickets}`,
            inline: false
        });

        embed.setFooter({ text: `Purchase ID: ${result.purchase._id}` })
            .setTimestamp();

        await interaction.editReply({
            content: '✅ Purchase completed successfully!',
            embeds: [embed]
        });

    } catch (error) {
        console.error('Error buying ticket via button:', error);
        await interaction.editReply({
            content: `❌ Error buying ticket: ${error.message}`
        });
    }
}

client.on('messageCreate', async message => {
    // Ignore messages from bots
    if (message.author.bot) return;

    // Handle message points
    await handleMessagePoints(message);
});

// Login to Discord
client.login(process.env.DISCORD_TOKEN);

// Export client for use in other modules
module.exports = { client }; 