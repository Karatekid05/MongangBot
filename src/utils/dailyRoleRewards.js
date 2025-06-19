const { awardCash, updateGangTotals } = require('./pointsManager');
const User = require('../models/User');

/**
 * Distribui cash diariamente para todos os membros que possuem um role específico
 * @param {Object} client - Discord client
 * @param {string} roleId - ID do role para filtrar os membros
 * @param {number} amount - Quantidade de cash a ser distribuída
 * @param {string} source - Categoria de pontos (default: 'others')
 */
async function distributeDailyRoleRewards(client, roleId, amount, source = 'others') {
    try {
        console.log(`Starting daily role rewards distribution for role ${roleId}...`);

        // Verificar se o cliente Discord está disponível
        if (!client || !client.guilds) {
            console.error('Discord client not available');
            return;
        }

        // Pegar todas as guilds (servidores) do bot
        const guilds = client.guilds.cache;
        let totalRewardsDistributed = 0;
        let totalMembersRewarded = 0;

        for (const [guildId, guild] of guilds) {
            try {
                console.log(`Processing guild: ${guild.name} (${guildId})`);

                // Buscar todos os membros da guild
                await guild.members.fetch();

                // Filtrar membros que possuem o role específico
                const membersWithRole = guild.members.cache.filter(member =>
                    member.roles.cache.has(roleId) && !member.user.bot
                );

                console.log(`Found ${membersWithRole.size} members with role ${roleId} in ${guild.name}`);

                // Distribuir cash para cada membro
                for (const [memberId, member] of membersWithRole) {
                    try {
                        // Verificar se o usuário existe no banco de dados
                        const user = await User.findOne({ userId: memberId });

                        if (user) {
                            // Usuário existe no banco, distribuir cash
                            const success = await awardCash(memberId, source, amount);

                            if (success) {
                                totalRewardsDistributed += amount;
                                totalMembersRewarded++;
                                console.log(`✅ Awarded ${amount} $CASH to ${member.user.username} (${memberId})`);
                            } else {
                                console.error(`❌ Failed to award cash to ${member.user.username} (${memberId})`);
                            }
                        } else {
                            console.log(`⏭️ User ${member.user.username} (${memberId}) not found in database - skipping`);
                        }
                    } catch (error) {
                        console.error(`Error processing member ${member.user.username}:`, error);
                    }
                }
            } catch (error) {
                console.error(`Error processing guild ${guild.name}:`, error);
            }
        }

        console.log(`Daily role rewards distribution completed!`);
        console.log(`Total members rewarded: ${totalMembersRewarded}`);
        console.log(`Total cash distributed: ${totalRewardsDistributed} $CASH`);
        console.log(`Role ID: ${roleId}`);
        console.log(`Amount per member: ${amount} $CASH`);
        console.log(`Source category: ${source}`);

    } catch (error) {
        console.error('Error in daily role rewards distribution:', error);
    }
}

/**
 * Função específica para distribuir 500 $CASH para membros com role 1385211569872310324
 * Executada diariamente às 23:10 UTC
 * @param {Object} client - Discord client
 */
async function dailySpecialRoleRewards(client) {
    const SPECIAL_ROLE_ID = '1385211569872310324';
    const REWARD_AMOUNT = 500;
    const SOURCE_CATEGORY = 'others';

    console.log('🎁 Starting daily special role rewards distribution...');
    await distributeDailyRoleRewards(client, SPECIAL_ROLE_ID, REWARD_AMOUNT, SOURCE_CATEGORY);
}

module.exports = {
    distributeDailyRoleRewards,
    dailySpecialRoleRewards
}; 