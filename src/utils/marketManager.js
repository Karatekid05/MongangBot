const { EmbedBuilder } = require('discord.js');
const MarketItem = require('../models/MarketItem');
const MarketPurchase = require('../models/MarketPurchase');
const { removeCash } = require('./pointsManager');

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
        const member = await guild.members.fetch(userId);
        if (member.roles.cache.has(item.roleId)) {
            return { success: false, error: 'You already have this role.' };
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
        
        if (marketItems.length === 0) {
            const embed = new EmbedBuilder()
                .setColor('#FF6B6B')
                .setTitle('🛒 **MONGANG MARKET**')
                .setDescription('No items available at the moment.')
                .setTimestamp();

            await message.edit({ embeds: [embed], components: [] });
            return;
        }

        // Create updated embed
        const embed = new EmbedBuilder()
            .setColor('#4ECDC4')
            .setTitle('🛒 **MONGANG MARKET**')
            .setDescription('Welcome to the Mongang Market! Buy exclusive WL and roles with your $CASH.')
            .setThumbnail(channel.guild.iconURL())
            .setTimestamp();

        // Add items to embed
        marketItems.forEach((item, index) => {
            const durationText = item.durationHours > 0 ? `${item.durationHours}h` : 'Permanent';
            const fieldValue = [
                `💰 **Price:** ${item.price} $CASH`,
                `⏰ **Duration:** ${durationText}`,
                `📝 **Description:** ${item.description}`
            ].join('\n');

            embed.addFields({
                name: `${index + 1}. ${item.name}`,
                value: fieldValue,
                inline: false
            });
        });

        // Create buttons for each item
        const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
        const buttons = marketItems.map((item, index) =>
            new ButtonBuilder()
                .setCustomId(`buy_market_${item._id}`)
                .setLabel(`Buy ${item.name}`)
                .setStyle(ButtonStyle.Primary)
                .setEmoji('🛒')
        );

        // Split buttons into rows of 3
        const rows = [];
        for (let i = 0; i < buttons.length; i += 3) {
            const row = new ActionRowBuilder().addComponents(buttons.slice(i, i + 3));
            rows.push(row);
        }

        embed.setFooter({ text: 'Click a button to purchase an item' });

        await message.edit({
            embeds: [embed],
            components: rows
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