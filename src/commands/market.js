const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits } = require('discord.js');
const { buyMarketItem, listMarketItems } = require('../utils/marketManager');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('market')
        .setDescription('Open the market to buy WL and roles')
        .addSubcommand(subcommand =>
            subcommand
                .setName('setup')
                .setDescription('Setup the market message in the current channel (Moderators only)'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('add')
                .setDescription('Add a new item to the market (Moderators only)')
                .addStringOption(option =>
                    option.setName('name')
                        .setDescription('Item name')
                        .setRequired(true))
                .addStringOption(option =>
                    option.setName('description')
                        .setDescription('Item description')
                        .setRequired(true))
                .addIntegerOption(option =>
                    option.setName('price')
                        .setDescription('Price in $CASH')
                        .setRequired(true))
                .addStringOption(option =>
                    option.setName('role_id')
                        .setDescription('Role ID to give when purchased')
                        .setRequired(true))
                .addIntegerOption(option =>
                    option.setName('duration_hours')
                        .setDescription('Duration in hours (0 for permanent)')
                        .setRequired(false)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('remove')
                .setDescription('Remove an item from the market (Moderators only)')
                .addStringOption(option =>
                    option.setName('item_id')
                        .setDescription('Item ID to remove')
                        .setRequired(true)
                        .setAutocomplete(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('list')
                .setDescription('List all market items (Moderators only)'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('buy')
                .setDescription('Buy an item from the market')
                .addStringOption(option =>
                    option.setName('item_id')
                        .setDescription('Item ID to buy')
                        .setRequired(true)
                        .setAutocomplete(true))),

    async autocomplete(interaction) {
        const focusedValue = interaction.options.getFocused();
        const marketItems = await listMarketItems();
        const filtered = marketItems.filter(item => 
            item.name.toLowerCase().includes(focusedValue.toLowerCase()) ||
            item._id.toString().includes(focusedValue)
        );

        await interaction.respond(
            filtered.map(item => ({ 
                name: `${item.name} - ${item.price} $CASH`, 
                value: item._id.toString() 
            }))
        );
    },

    async execute(interaction, client) {
        const subcommand = interaction.options.getSubcommand();

        // Check permissions for moderator commands
        if (['setup', 'add', 'remove', 'list'].includes(subcommand)) {
            if (!interaction.member.permissions.has(PermissionFlagsBits.ManageRoles)) {
                return interaction.reply({
                    content: '❌ You need Manage Roles permission to use this command.',
                    ephemeral: true
                });
            }
        }

        switch (subcommand) {
            case 'setup':
                await this.handleSetup(interaction);
                break;
            case 'add':
                await this.handleAdd(interaction);
                break;
            case 'remove':
                await this.handleRemove(interaction);
                break;
            case 'list':
                await this.handleList(interaction);
                break;
            case 'buy':
                await this.handleBuy(interaction);
                break;
        }
    },

    async handleSetup(interaction) {
        await interaction.deferReply({ ephemeral: true });

        try {
            // Use fixed log channel ID
            const logChannelId = '1353880966074073109';
            const marketChannelId = '1400183182086766682';
            
            // Verify log channel exists
            const logChannel = await interaction.guild.channels.fetch(logChannelId).catch(() => null);
            if (!logChannel) {
                return interaction.editReply('❌ Log channel not found. Please check the configuration.');
            }

            // Get market channel
            const marketChannel = await interaction.guild.channels.fetch(marketChannelId).catch(() => null);
            if (!marketChannel) {
                return interaction.editReply('❌ Market channel not found. Please check the configuration.');
            }

            // Get market items
            const marketItems = await listMarketItems();
            
            // Create marketplace embed like Engage Bot
            const embed = new EmbedBuilder()
                .setColor('#2F3136')
                .setTitle('**Marketplace**')
                .setDescription('')
                .setThumbnail(null);

            // Add items in Engage Bot format
            if (marketItems.length > 0) {
                let itemsList = '';
                marketItems.forEach((item, index) => {
                    const roleMention = `<@&${item.roleId}>`;
                    itemsList += `🛒 • ${roleMention} | ${item.price} $CASH • Unlimited spots\n`;
                });
                
                embed.setDescription(itemsList);
            } else {
                embed.setDescription('No items available at the moment.\n\nAdd items using `/market add` to start selling!');
            }

            // Create "Buy Item" button
            const buyButton = new ButtonBuilder()
                .setCustomId('market_buy_item')
                .setLabel('Buy Item')
                .setStyle(ButtonStyle.Success)
                .setEmoji('🛒');

            const row = new ActionRowBuilder().addComponents(buyButton);

            // Send the marketplace message to the market channel
            const marketMessage = await marketChannel.send({
                embeds: [embed],
                components: [row]
            });

            // Store the market message info
            await require('../utils/marketManager').setMarketMessage(marketChannelId, marketMessage.id, logChannelId);

            await interaction.editReply('✅ Marketplace setup complete! The marketplace message has been posted in the market channel.');

        } catch (error) {
            console.error('Error setting up market:', error);
            await interaction.editReply('❌ Error setting up market. Please try again.');
        }
    },

    async handleAdd(interaction) {
        await interaction.deferReply({ ephemeral: true });

        try {
            const name = interaction.options.getString('name');
            const description = interaction.options.getString('description');
            const price = interaction.options.getInteger('price');
            const roleId = interaction.options.getString('role_id');
            const durationHours = interaction.options.getInteger('duration_hours') || 0;

            // Verify role exists
            const role = await interaction.guild.roles.fetch(roleId).catch(() => null);
            if (!role) {
                return interaction.editReply('❌ Invalid role ID.');
            }

            // Add item to market
            const item = await require('../utils/marketManager').addMarketItem({
                name,
                description,
                price,
                roleId,
                durationHours,
                createdBy: interaction.user.id
            });

            await interaction.editReply(`✅ Item "${name}" added to market for ${price} $CASH.`);

        } catch (error) {
            console.error('Error adding market item:', error);
            await interaction.editReply('❌ Error adding market item. Please try again.');
        }
    },

    async handleRemove(interaction) {
        await interaction.deferReply({ ephemeral: true });

        try {
            const itemId = interaction.options.getString('item_id');
            
            const result = await require('../utils/marketManager').removeMarketItem(itemId);
            
            if (result) {
                await interaction.editReply('✅ Item removed from market.');
            } else {
                await interaction.editReply('❌ Item not found.');
            }

        } catch (error) {
            console.error('Error removing market item:', error);
            await interaction.editReply('❌ Error removing market item. Please try again.');
        }
    },

    async handleList(interaction) {
        await interaction.deferReply({ ephemeral: true });

        try {
            const marketItems = await listMarketItems();
            
            if (marketItems.length === 0) {
                return interaction.editReply('No market items available.');
            }

            const embed = new EmbedBuilder()
                .setColor('#4ECDC4')
                .setTitle('🛒 Market Items')
                .setTimestamp();

            marketItems.forEach((item, index) => {
                const durationText = item.durationHours > 0 ? `${item.durationHours}h` : 'Permanent';
                embed.addFields({
                    name: `${index + 1}. ${item.name} (ID: ${item._id})`,
                    value: `💰 Price: ${item.price} $CASH\n⏰ Duration: ${durationText}\n📝 ${item.description}`,
                    inline: false
                });
            });

            await interaction.editReply({ embeds: [embed] });

        } catch (error) {
            console.error('Error listing market items:', error);
            await interaction.editReply('❌ Error listing market items. Please try again.');
        }
    },

    async handleBuy(interaction) {
        await interaction.deferReply({ ephemeral: true });

        try {
            const itemId = interaction.options.getString('item_id');
            const userId = interaction.user.id;
            const username = interaction.user.username;

            const result = await buyMarketItem(itemId, userId, username, interaction.guild);

            if (result.success) {
                await interaction.editReply(`✅ Successfully purchased **${result.itemName}** for ${result.price} $CASH!`);
            } else {
                await interaction.editReply(`❌ ${result.error}`);
            }

        } catch (error) {
            console.error('Error buying market item:', error);
            await interaction.editReply('❌ Error processing purchase. Please try again.');
        }
    }
}; 