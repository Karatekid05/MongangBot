const { EmbedBuilder } = require('discord.js');
const MarketItem = require('../models/MarketItem');
const MarketPurchase = require('../models/MarketPurchase');
const { removeCash } = require('./pointsManager');
const { FASTSHOTER_ROLE_ID, CAPO_ROLE_ID } = require('./constants');

/**
 * Add a new item to the market
 * @param {Object} itemData - Item data
 * @returns {Object} - Created market item
 */
async function addMarketItem(itemData) {
    try {
        const marketItem = new MarketItem({
            name: itemData.name,
            description: itemData.description,
            price: itemData.price,
            roleId: itemData.roleId,
            durationHours: itemData.durationHours || 0,
            spots: itemData.spots || 0,
            soldSpots: 0,
            externalWl: !!itemData.externalWl,
            createdBy: itemData.createdBy,
            isActive: true
        });

        await marketItem.save();
        return marketItem;
    } catch (error) {
        console.error('Error adding market item:', error);
        throw error;
    }
}

/**
 * Remove an item from the market
 * @param {string} itemId - Item ID to remove
 * @returns {boolean} - Success status
 */
async function removeMarketItem(itemId) {
    try {
        const result = await MarketItem.findByIdAndUpdate(itemId, { isActive: false });
        return !!result;
    } catch (error) {
        console.error('Error removing market item:', error);
        throw error;
    }
}

/**
 * List all active market items
 * @returns {Array} - Array of market items
 */
async function listMarketItems() {
    try {
        return await MarketItem.find({ isActive: true }).sort({ createdAt: -1 });
    } catch (error) {
        console.error('Error listing market items:', error);
        throw error;
    }
}

/**
 * Get a specific market item
 * @param {string} itemId - Item ID
 * @returns {Object|null} - Market item or null
 */
async function getMarketItem(itemId) {
    try {
        return await MarketItem.findById(itemId);
    } catch (error) {
        console.error('Error getting market item:', error);
        throw error;
    }
}

/**
 * Buy a market item
 * @param {string} itemId - Item ID to buy
 * @param {string} userId - User ID
 * @param {string} username - Username
 * @param {Guild} guild - Discord guild
 * @returns {Object} - Result object
 */
async function buyMarketItem(itemId, userId, username, guild) {
    try {
        // Get the market item
        const item = await getMarketItem(itemId);
        if (!item || !item.isActive) {
            return { success: false, error: 'Item not found or not available.' };
        }

        // Fetch member for role checks
        const member = await guild.members.fetch(userId);

        // Enforce purchase rules
        // 1) Users who don't have FastShoter can't buy Capo
        if (item.roleId === CAPO_ROLE_ID && !member.roles.cache.has(FASTSHOTER_ROLE_ID)) {
            return { success: false, error: 'You must have the FastShoter role to buy Capo.' };
        }

        // 2) Users who don't have Capo can't buy WL from other projects
        if (item.externalWl && !member.roles.cache.has(CAPO_ROLE_ID)) {
            return { success: false, error: 'You must have the Capo role to buy external project WL.' };
        }

        // Check if user has enough cash
        const User = require('../models/User');
        const user = await User.findOne({ userId });
        
        if (!user) {
            return { success: false, error: 'User not found. Please register first.' };
        }

        if (user.cash < item.price) {
            return { 
                success: false, 
                error: `Insufficient $CASH. You have ${user.cash} $CASH, but this item costs ${item.price} $CASH.` 
            };
        }

        // Check if user already has this role (for permanent roles)
        if (member.roles.cache.has(item.roleId)) {
            return { success: false, error: 'You already have this role.' };
        }

        // Check if spots are available
        if (item.spots > 0 && item.soldSpots >= item.spots) {
            return { success: false, error: 'This item is sold out.' };
        }

        // Remove cash from user
        await removeCash(userId, item.price, 'market_purchase');

        // Add role to user
        try {
            await member.roles.add(item.roleId);
        } catch (roleError) {
            console.error('Error adding role:', roleError);
            // Refund the cash if role assignment fails
            const { awardCash } = require('./pointsManager');
            await awardCash(userId, 'market_refund', item.price);
            return { success: false, error: 'Error assigning role. Your $CASH has been refunded.' };
        }

        // Create purchase record
        const purchase = new MarketPurchase({
            itemId: item._id,
            userId: userId,
            username: username,
            price: item.price,
            roleId: item.roleId,
            durationHours: item.durationHours,
            purchasedAt: new Date()
        });

        await purchase.save();

        // Update sold spots count
        if (item.spots > 0) {
            await MarketItem.findByIdAndUpdate(item._id, { $inc: { soldSpots: 1 } });
        }

        // Schedule role removal if temporary
        if (item.durationHours > 0) {
            scheduleRoleRemoval(userId, item.roleId, item.durationHours, guild);
        }

        // Log the purchase
        await logPurchase(item, userId, username, guild);

        return { 
            success: true, 
            itemName: item.name, 
            price: item.price,
            duration: item.durationHours > 0 ? `${item.durationHours} hours` : 'Permanent'
        };

    } catch (error) {
        console.error('Error buying market item:', error);
        throw error;
    }
}

/**
 * Schedule role removal for temporary roles
 * @param {string} userId - User ID
 * @param {string} roleId - Role ID
 * @param {number} durationHours - Duration in hours
 * @param {Guild} guild - Discord guild
 */
function scheduleRoleRemoval(userId, roleId, durationHours, guild) {
    const removalTime = Date.now() + (durationHours * 60 * 60 * 1000);
    
    setTimeout(async () => {
        try {
            const member = await guild.members.fetch(userId);
            if (member.roles.cache.has(roleId)) {
                await member.roles.remove(roleId);
                console.log(`Temporary role removed from user ${userId} after ${durationHours} hours`);
                
                // Log the role removal
                await logRoleRemoval(userId, roleId, guild);
            }
        } catch (error) {
            console.error('Error removing temporary role:', error);
        }
    }, durationHours * 60 * 60 * 1000);
}

/**
 * Log purchase to the log channel
 * @param {Object} item - Market item
 * @param {string} userId - User ID
 * @param {string} username - Username
 * @param {Guild} guild - Discord guild
 */
async function logPurchase(item, userId, username, guild) {
    try {
        const marketMessage = await getMarketMessage();
        if (!marketMessage || !marketMessage.logChannelId) {
            console.log('No log channel configured for market purchases');
            return;
        }

        const logChannel = await guild.channels.fetch(marketMessage.logChannelId);
        if (!logChannel) {
            console.log('Log channel not found');
            return;
        }

        const embed = new EmbedBuilder()
            .setColor('#4ECDC4')
            .setTitle('🛒 Market Purchase')
            .setDescription(`**${username}** purchased **${item.name}**`)
            .addFields(
                { name: '💰 Price', value: `${item.price} $CASH`, inline: true },
                { name: '👤 User', value: `<@${userId}>`, inline: true },
                { name: '⏰ Duration', value: item.durationHours > 0 ? `${item.durationHours}h` : 'Permanent', inline: true },
                { name: '📝 Description', value: item.description, inline: false }
            )
            .setTimestamp();

        await logChannel.send({ embeds: [embed] });

    } catch (error) {
        console.error('Error logging purchase:', error);
    }
}

/**
 * Log role removal to the log channel
 * @param {string} userId - User ID
 * @param {string} roleId - Role ID
 * @param {Guild} guild - Discord guild
 */
async function logRoleRemoval(userId, roleId, guild) {
    try {
        const marketMessage = await getMarketMessage();
        if (!marketMessage || !marketMessage.logChannelId) {
            return;
        }

        const logChannel = await guild.channels.fetch(marketMessage.logChannelId);
        if (!logChannel) {
            return;
        }

        const member = await guild.members.fetch(userId);
        const role = await guild.roles.fetch(roleId);

        const embed = new EmbedBuilder()
            .setColor('#FF6B6B')
            .setTitle('⏰ Temporary Role Expired')
            .setDescription(`**${member.user.username}**'s temporary role has expired`)
            .addFields(
                { name: '👤 User', value: `<@${userId}>`, inline: true },
                { name: '🎭 Role', value: role ? role.name : 'Unknown Role', inline: true }
            )
            .setTimestamp();

        await logChannel.send({ embeds: [embed] });

    } catch (error) {
        console.error('Error logging role removal:', error);
    }
}

/**
 * Set market message configuration
 * @param {string} channelId - Channel ID
 * @param {string} messageId - Message ID
 * @param {string} logChannelId - Log channel ID
 */
async function setMarketMessage(channelId, messageId, logChannelId) {
    try {
        const MarketMessage = require('../models/MarketMessage');
        
        // Update or create market message config
        await MarketMessage.findOneAndUpdate(
            { channelId },
            { 
                channelId, 
                messageId, 
                logChannelId,
                updatedAt: new Date()
            },
            { upsert: true, new: true }
        );
    } catch (error) {
        console.error('Error setting market message:', error);
        throw error;
    }
}

/**
 * Get market message configuration
 * @returns {Object|null} - Market message config or null
 */
async function getMarketMessage() {
    try {
        const MarketMessage = require('../models/MarketMessage');
        return await MarketMessage.findOne();
    } catch (error) {
        console.error('Error getting market message:', error);
        throw error;
    }
}

/**
 * Update market message with current items
 * @param {string} channelId - Channel ID
 * @param {string} messageId - Message ID
 * @param {Client} client - Discord client
 */
async function updateMarketMessage(channelId, messageId, client) {
    try {
        const channel = await client.channels.fetch(channelId);
        if (!channel) return;

        const message = await channel.messages.fetch(messageId);
        if (!message) return;

        const marketItems = await listMarketItems();
        
        // Create marketplace embed like Engage Bot
        const embed = new EmbedBuilder()
            .setColor('#2F3136')
            .setTitle('**Marketplace**')
            .setDescription('Loading marketplace items...')
            .setThumbnail(null);

        // Add items in Engage Bot format
        if (marketItems.length > 0) {
            let itemsList = '';
            marketItems.forEach((item, index) => {
                const roleMention = `<@&${item.roleId}>`;
                const spotsText = item.spots > 0 ? `${item.spots - item.soldSpots} spots left` : 'Unlimited spots';
                itemsList += `🛒 • ${roleMention} | ${item.price} $CASH • ${spotsText}\n`;
            });
            
            embed.setDescription(itemsList);
        } else {
            embed.setDescription('No items available at the moment.\n\nAdd items using `/market add` to start selling!');
        }

        // Create "Buy Item" button
        const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
        const buyButton = new ButtonBuilder()
            .setCustomId('market_buy_item')
            .setLabel('Buy Item')
            .setStyle(ButtonStyle.Success)
            .setEmoji('🛒');

        const row = new ActionRowBuilder().addComponents(buyButton);

        await message.edit({
            embeds: [embed],
            components: [row]
        });

    } catch (error) {
        console.error('Error updating market message:', error);
    }
}

module.exports = {
    addMarketItem,
    removeMarketItem,
    listMarketItems,
    getMarketItem,
    buyMarketItem,
    setMarketMessage,
    getMarketMessage,
    updateMarketMessage
}; 