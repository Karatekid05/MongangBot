const { awardCash, updateGangTotals } = require('./pointsManager');
const User = require('../models/User');
const { getUserGangWithPriority, GANGS } = require('./constants');

/**
 * Distribui cash diariamente para todos os membros que possuem um role específico
 * @param {Object} client - Discord client
 * @param {string} roleId - ID do role para filtrar os membros
 * @param {number} amount - Quantidade de cash a ser distribuída
 * @param {string} source - Categoria de pontos (default: 'others')
 */
async function distributeDailyRoleRewards(client, roleId, amount, source = 'others') {
    try {
        console.log('Role-based rewards are disabled; skipping role rewards distribution.');
        return;

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
                        let user = await User.findOne({ userId: memberId });

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
                            // Tentar criar o utilizador: usar gang do Discord, senão escolher aleatoriamente
                            let gang = getUserGangWithPriority(member);
                            if (!gang) {
                                // Escolher uma gang aleatória quando o membro ainda não tem gang
                                const idx = Math.floor(Math.random() * GANGS.length);
                                gang = GANGS[idx];
                                console.log(`No gang role found for ${member.user.username}. Assigning random gang: ${gang.name}`);
                            }
                            if (gang) {
                                try {
                                    user = new User({
                                        userId: memberId,
                                        username: member.user.username,
                                        gangId: gang.roleId,
                                        cash: 0,
                                        weeklyCash: 0,
                                        lastMessageReward: new Date(0)
                                    });
                                    await user.save();
                                    // Atribuir o cargo da gang no Discord
                                    try {
                                        await member.roles.add(gang.roleId);
                                        console.log(`Assigned gang role ${gang.roleId} (${gang.name}) to ${member.user.username}`);
                                    } catch (roleErr) {
                                        console.error(`Failed to assign gang role ${gang.roleId} to ${member.user.username}:`, roleErr);
                                    }
                                    const success = await awardCash(memberId, source, amount);
                                    if (success) {
                                        totalRewardsDistributed += amount;
                                        totalMembersRewarded++;
                                        console.log(`🆕 Created user and awarded ${amount} $CASH to ${member.user.username} (${memberId})`);
                                    }
                                } catch (createErr) {
                                    console.error(`Failed to create user for ${member.user.username}:`, createErr);
                                }
                            }
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

    console.log('Role-based rewards are disabled; skipping daily special role rewards.');
    return;
}

/**
 * Nightly Matrica role-based rewards
 * - 1406329826461352120 → 50 $CASH
 * - 1406330019936211164 → 150 $CASH
 * - 1402656276441469050 → 0 $CASH (presence only)
 */
async function nightlyMatricaRoleRewards(client) {
    try {
        console.log('Role-based rewards are disabled; skipping nightly Matrica role rewards.');
        return;
    } catch (error) {
        console.error('Error running nightly Matrica role rewards:', error);
    }
}

module.exports = {
    distributeDailyRoleRewards,
    dailySpecialRoleRewards,
    nightlyMatricaRoleRewards
}; 