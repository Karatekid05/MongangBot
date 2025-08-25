const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const User = require('../models/User');
const Gang = require('../models/Gang');
const { MATRICA_CASH_50_ROLE_ID, MATRICA_CASH_150_ROLE_ID, COLLECTION3_ROLE_ID } = require('../utils/constants');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('profile')
        .setDescription('Display your profile or another user profile with detailed information')
        .addUserOption(option =>
            option.setName('user')
                .setDescription('User to view information (optional, default: you)')
                .setRequired(false)),

    async execute(interaction) {
        // Determine which user to show information for
        const targetUser = interaction.options.getUser('user') || interaction.user;

        try {
            // Reply immediately to prevent timeout
            await interaction.reply(`Fetching profile data for ${targetUser.username}...`);

            // Fetch user information from the database
            const userData = await User.findOne({ userId: targetUser.id });

            if (!userData) {
                return interaction.editReply(`${targetUser.username} is not registered in the system. The user needs to send a message in a gang channel or be a member of a gang.`);
            }

            // Fetch user's gang information
            const gang = await Gang.findOne({ roleId: userData.gangId });
            const gangName = gang ? gang.name : 'Unknown';

            // Get the appropriate gang emoji based on gang name
            let gangEmoji = '🏮'; // Default emoji
            if (gangName) {
                switch (gangName) {
                    case 'Sea Kings':
                        gangEmoji = '<:SeaKings:1353406384527507467>';
                        break;
                    case 'Thunder Birds':
                        gangEmoji = '<:ThunderBirds:1353406329154437162>';
                        break;
                    case 'Chunky Cats':
                        gangEmoji = '<:ChunkyCats:1353406387170050250>';
                        break;
                    case 'Fluffy Ninjas':
                        gangEmoji = '<:FluffyNinjas:1353406382224969903>';
                        break;
                    case 'Mad Gang':
                        gangEmoji = '<:Mad:1396833938898685962>';
                        break;
                    default:
                        gangEmoji = '🏮';
                }
            }

            // Role-based daily rewards (Matrica)
            let member = null;
            try { member = await interaction.guild.members.fetch(targetUser.id); } catch {}
            const has50 = member ? member.roles.cache.has(MATRICA_CASH_50_ROLE_ID) : false;
            const has150 = member ? member.roles.cache.has(MATRICA_CASH_150_ROLE_ID) : false;
            const hasPass = member ? member.roles.cache.has(COLLECTION3_ROLE_ID) : false;

            // Create embed with user information
            const embed = new EmbedBuilder()
                .setTitle(`${targetUser.username}'s Profile`)
                .setThumbnail(targetUser.displayAvatarURL())
                .setColor('#FFD700');

            // Economy section - Simples e direto
            embed.addFields({
                name: '💰 Economy',
                value: `💵 **Total $CASH:** ${userData.cash}\n📊 **Weekly $CASH:** ${userData.weeklyCash}\n${gangEmoji} **Gang:** ${gangName}`,
                inline: false
            });

            // Espaço entre seções
            embed.addFields({ name: '\u200B', value: '\u200B', inline: false });

            // Verification & roles section (Matrica)
            embed.addFields({
                name: '🖼️ Verification & Roles (Matrica)',
                value: `• <@&${MATRICA_CASH_50_ROLE_ID}>: ${has50 ? 'Yes' : 'No'}\n` +
                       `• <@&${MATRICA_CASH_150_ROLE_ID}>: ${has150 ? 'Yes' : 'No'}\n` +
                       `• <@&${COLLECTION3_ROLE_ID}>: ${hasPass ? 'Yes' : 'No'}\n`,
                inline: false
            });

            // Espaço entre seções
            embed.addFields({ name: '\u200B', value: '\u200B', inline: false });

            // Activity points section - Mais limpo e organizado
            embed.addFields({
                name: '📈 Activity Points',
                value: `🎮 **Games:** ${userData.pointsBySource?.games || 0}\n🎨 **Memes & Art:** ${userData.pointsBySource?.memesAndArt || 0}\n💬 **Chat:** ${userData.pointsBySource?.chatActivity || 0}\n💵 **NFTs:** ${userData.pointsBySource?.nftRewards || 0}\n🎁 **Others:** ${userData.pointsBySource?.others || 0}`,
                inline: false
            });

            // Add wallet address if registered (masked)
            if (userData.walletAddress) {
                // Mask the wallet address to show only the first 6 and last 4 characters
                const walletAddress = userData.walletAddress;
                const maskedWallet = `${walletAddress.substring(0, 6)}...${walletAddress.substring(walletAddress.length - 4)}`;

                embed.addFields(
                    { name: '\u200B', value: '\u200B', inline: false },
                    { name: '👛 Wallet', value: `\`${maskedWallet}\``, inline: false }
                );
            }

            embed.setFooter({ text: `Profile updated • ${new Date().toLocaleString()}` });
            embed.setTimestamp();

            await interaction.editReply({ content: '', embeds: [embed] });
        } catch (error) {
            console.error(`Error fetching user info for ${targetUser.username}:`, error);

            try {
                await interaction.editReply(`Error fetching profile data for ${targetUser.username}. Please try again later.`);
            } catch (followUpError) {
                console.error('Failed to send error response:', followUpError);

                try {
                    await interaction.followUp({
                        content: `Error fetching profile data for ${targetUser.username}. Please try again later.`,
                        ephemeral: true
                    });
                } catch (finalError) {
                    console.error('All attempts to respond failed:', finalError);
                }
            }
        }
    },
}; 