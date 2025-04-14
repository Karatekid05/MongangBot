const User = require('../models/User');
const Gang = require('../models/Gang');
const { POINTS_PER_MESSAGE, MESSAGE_COOLDOWN_MS, GANGS, ADDITIONAL_CHAT_CHANNELS } = require('./constants');
const { client } = require('../index'); // Assuming client is imported from index.js

// Role IDs para membros da equipe que não devem ganhar pontos
// ATENÇÃO: Verificar se estes IDs estão corretos - devem corresponder aos roles no Discord
const TEAM_ROLE_IDS = [
    '1339293248308641883', // Founders
    '1338993206112817283'  // Moderators
];

// Importar do arquivo de permissões para garantir consistência
const { isModerator } = require('./permissions');

/**
 * Handle message points - award points for messages in gang channels
 * @param {Message} message - Discord message object
 */
async function handleMessagePoints(message) {
    try {
        // Check if the message is in a gang channel or additional chat channel
        const gangChannel = GANGS.find(gang => gang.channelId === message.channel.id);
        const isAdditionalChannel = ADDITIONAL_CHAT_CHANNELS.includes(message.channel.id);

        // Se não for nem canal de gang nem canal adicional, ignorar
        if (!gangChannel && !isAdditionalChannel) return;

        // Get user info
        const userId = message.author.id;

        // Fetch Discord member to check roles
        const member = await message.guild.members.fetch(userId).catch(err => {
            console.error(`Could not fetch member ${userId}:`, err);
            return null;
        });

        if (!member) return; // Could not fetch member

        // Check if the user has any team role (Founders or Moderators)
        // Usar ambos os métodos para garantir verificação correta
        const isTeamMember = TEAM_ROLE_IDS.some(roleId => member.roles.cache.has(roleId));
        const isModeratorCheck = isModerator(member);

        // Se o usuário for membro da equipe, não conceder pontos
        if (isTeamMember || isModeratorCheck) {
            console.log(`User ${member.user.username} is a team member and won't earn points. Role check: ${isTeamMember}, Mod check: ${isModeratorCheck}`);
            return; // Encerrar a função sem conceder pontos
        }

        // Find or create user
        let user = await User.findOne({ userId });

        if (!user) {
            // Se for um canal adicional e o usuário não existir, tentar encontrar uma gang
            if (isAdditionalChannel) {
                // Verificar se o usuário pertence a alguma gang
                let userGang = GANGS.find(gang => member.roles.cache.has(gang.roleId));

                // Se o usuário não pertencer a nenhuma gang, usar a primeira como padrão
                if (!userGang && GANGS.length > 0) {
                    userGang = GANGS[0];

                    // Se possível, adicionar o papel ao usuário (se tivermos permissão)
                    try {
                        await member.roles.add(userGang.roleId);
                        console.log(`Role ${userGang.name} added to ${member.user.username}`);
                    } catch (roleErr) {
                        console.error(`Could not add role ${userGang.name} to ${member.user.username}:`, roleErr);
                        // Continue even without being able to add the role
                    }
                }

                if (!userGang) return; // Nenhuma gang disponível

                // Criar novo usuário
                user = createNewUser(userId, message.author.username, userGang.roleId);

                try {
                    await user.save();
                    console.log(`New user registered from additional channel: ${message.author.username} in gang ${userGang.name}`);
                } catch (saveError) {
                    console.error(`Error saving new user ${message.author.username}:`, saveError);
                    return; // Exit if we can't save the user
                }
            } else {
                // Check all gangs to find one the user belongs to
                let userGang = GANGS.find(gang => member.roles.cache.has(gang.roleId));

                // If user doesn't belong to any gang, check current channel
                if (!userGang) {
                    // Automatically assign the gang of the channel where the message was sent
                    userGang = gangChannel;

                    // If possible, add the role to the user (if we have permission)
                    try {
                        await member.roles.add(userGang.roleId);
                        console.log(`Role ${userGang.name} added to ${member.user.username}`);
                    } catch (roleErr) {
                        console.error(`Could not add role ${userGang.name} to ${member.user.username}:`, roleErr);
                        // Continue even without being able to add the role
                    }
                }

                if (!userGang) return; // User doesn't belong to any gang

                // Create new user
                user = createNewUser(userId, message.author.username, userGang.roleId);

                try {
                    await user.save();
                    console.log(`New user registered: ${message.author.username} in gang ${userGang.name}`);
                } catch (saveError) {
                    console.error(`Error saving new user ${message.author.username}:`, saveError);
                    return; // Exit if we can't save the user
                }
            }
        } else {
            // Verificação adicional para usuários existentes
            // Se o usuário já existir no banco de dados, ainda verificamos se ele é moderador
            // Esta verificação dupla garante que moderadores nunca ganhem pontos
            if (isTeamMember || isModeratorCheck) {
                console.log(`Existing user ${user.username} is a team member and won't earn points.`);
                return;
            }
        }

        // Check cooldown
        const now = new Date();
        if (user.lastMessageReward && now - user.lastMessageReward < MESSAGE_COOLDOWN_MS) {
            return; // Message is on cooldown, don't award points
        }

        // Verificação final antes de conceder pontos
        if (isTeamMember || isModeratorCheck) {
            console.log(`Final check: User ${user.username} is a team member and won't earn points.`);
            return;
        }

        // Award points
        user.cash += POINTS_PER_MESSAGE;
        user.weeklyCash += POINTS_PER_MESSAGE;
        user.pointsBySource.chatActivity += POINTS_PER_MESSAGE;
        user.lastMessageReward = now;

        // Save user
        try {
            await user.save();
            console.log(`Points awarded to ${user.username}: +${POINTS_PER_MESSAGE} (current total: ${user.cash})`);
        } catch (saveError) {
            console.error(`Error saving points for ${message.author.username}:`, saveError);
            return;
        }

        // Update gang totals
        try {
            await updateGangTotals(user.gangId);
        } catch (gangError) {
            console.error(`Error updating gang totals:`, gangError);
        }

    } catch (error) {
        console.error('Error handling message points:', error);
    }
}

/**
 * Cria um novo usuário com valores padrão
 * @param {string} userId - ID do usuário
 * @param {string} username - Nome do usuário
 * @param {string} gangId - ID da gang
 * @returns {Object} Novo objeto de usuário
 */
function createNewUser(userId, username, gangId) {
    return new User({
        userId,
        username,
        gangId,
        cash: 0,
        weeklyCash: 0,
        lastMessageReward: new Date(0), // Set initial date in the past
        nfts: {
            collection1Count: 0,
            collection2Count: 0
        },
        pointsBySource: {
            games: 0,
            memesAndArt: 0,
            chatActivity: 0,
            others: 0,
            nftRewards: 0
        }
    });
}

/**
 * Award cash to a user
 * @param {string} userId - Discord user ID
 * @param {string} source - Source of the award (games, memesAndArt, chatActivity, others)
 * @param {number} amount - Amount to award
 */
async function awardCash(userId, source, amount) {
    try {
        // Find user
        const user = await User.findOne({ userId });
        if (!user) return false;

        // Award points
        user.cash += amount;
        user.weeklyCash += amount;

        // Track the source
        if (source && user.pointsBySource[source] !== undefined) {
            user.pointsBySource[source] += amount;
        } else {
            user.pointsBySource.others += amount;
        }

        // Save user
        await user.save();

        // Update gang totals for current gang only
        await updateGangTotals(user.gangId);

        return true;
    } catch (error) {
        console.error('Error awarding cash:', error);
        return false;
    }
}

/**
 * Remove cash from a user
 * @param {string} userId - Discord user ID
 * @param {number} amount - Amount to remove
 */
async function removeCash(userId, amount) {
    try {
        // Find user
        const user = await User.findOne({ userId });
        if (!user) return false;

        // Remove points (don't go below 0)
        const prevCash = user.cash;
        user.cash = Math.max(0, user.cash - amount);
        user.weeklyCash = Math.max(0, user.weeklyCash - amount);

        // Calculate actual amount removed (in case user had less than amount)
        const actualAmountRemoved = prevCash - user.cash;

        // Save user
        await user.save();

        // Update gang totals only for current gang
        // Cash contributed to previous gangs remains untouched
        await updateGangTotals(user.gangId);

        return { success: true, amountRemoved: actualAmountRemoved };
    } catch (error) {
        console.error('Error removing cash:', error);
        return { success: false, amountRemoved: 0 };
    }
}

/**
 * Award a trophy to a gang
 * @param {string} gangId - Gang role ID
 */
async function awardTrophy(gangId) {
    try {
        // Find gang
        const gang = await Gang.findOne({ roleId: gangId });
        if (!gang) return false;

        // Award trophy
        gang.trophies += 1;

        // Save gang
        await gang.save();

        return true;
    } catch (error) {
        console.error('Error awarding trophy:', error);
        return false;
    }
}

/**
 * Remove a trophy from a gang
 * @param {string} gangId - Gang role ID
 */
async function removeTrophy(gangId) {
    try {
        // Find gang
        const gang = await Gang.findOne({ roleId: gangId });
        if (!gang) return false;

        // Remove trophy (don't go below 0)
        gang.trophies = Math.max(0, gang.trophies - 1);

        // Save gang
        await gang.save();

        return true;
    } catch (error) {
        console.error('Error removing trophy:', error);
        return false;
    }
}

/**
 * Update gang total cash based on members and past contributions
 * @param {string} gangId - Gang role ID
 */
async function updateGangTotals(gangId) {
    try {
        // Get all members in the gang
        const users = await User.find({ gangId });

        // Calcular o total de cash atual dos membros
        const currentMembersCash = users.reduce((sum, user) => sum + user.cash, 0);
        const weeklyMembersCash = users.reduce((sum, user) => sum + user.weeklyCash, 0);

        // Agora vamos adicionar as contribuições históricas de usuários que mudaram de gang
        // Buscar todos os usuários que já contribuíram para esta gang (mesmo não sendo mais membros)
        const contributingUsers = await User.find({
            $or: [
                { [`gangContributions.${gangId}`]: { $exists: true, $gt: 0 } },
                { gangId: gangId }
            ]
        });

        // Calcular contribuições históricas
        let historicalContributions = 0;

        for (const user of contributingUsers) {
            // Se o usuário não é mais membro desta gang mas contribuiu no passado
            if (user.gangId !== gangId && user.gangContributions && user.gangContributions.get(gangId)) {
                const contributionAmount = user.gangContributions.get(gangId) || 0;
                historicalContributions += contributionAmount;
                console.log(`User ${user.username} has historical contribution of ${contributionAmount} to gang ${gangId}`);
            }
        }

        // O total de cash é a soma do cash atual dos membros + contribuições históricas
        const totalCash = currentMembersCash + historicalContributions;

        console.log(`Gang ${gangId} totals: Current members: ${currentMembersCash}, Historical: ${historicalContributions}, Total: ${totalCash}`);

        // Update gang
        await Gang.findOneAndUpdate(
            { roleId: gangId },
            { totalCash, weeklyTotalCash: weeklyMembersCash }
        );

        return { totalCash, weeklyTotalCash: weeklyMembersCash, historicalContributions };
    } catch (error) {
        console.error('Error updating gang totals:', error);
        return null;
    }
}

// Reset weekly stats
async function resetWeeklyStats() {
    try {
        // Reset user weekly stats
        await User.updateMany({}, { weeklyCash: 0 });

        // Reset gang weekly stats
        await Gang.updateMany({}, { weeklyTotalCash: 0 });

        return true;
    } catch (error) {
        console.error('Error resetting weekly stats:', error);
        return false;
    }
}

/**
 * Transfer cash from one user to another
 * @param {string} fromUserId - Discord user ID of the sender
 * @param {string} toUserId - Discord user ID of the recipient
 * @param {number} amount - Amount to transfer
 * @returns {Object} Result with success status and message
 */
async function transferCash(fromUserId, toUserId, amount) {
    try {
        // Find both users
        const fromUser = await User.findOne({ userId: fromUserId });
        const toUser = await User.findOne({ userId: toUserId });

        // Check if both users exist
        if (!fromUser || !toUser) {
            return {
                success: false,
                message: !fromUser
                    ? 'Sender is not registered in the system'
                    : 'Recipient is not registered in the system'
            };
        }

        // Check if sender has enough cash
        if (fromUser.cash < amount) {
            return {
                success: false,
                message: `You don't have enough cash. Your balance: ${fromUser.cash} $CASH`
            };
        }

        // Perform the transfer
        fromUser.cash -= amount;
        toUser.cash += amount;

        // Save both users
        await fromUser.save();
        await toUser.save();

        // Update gang totals for both users' current gangs only
        // Histórico de contribuições para gangs anteriores permanece intacto
        await updateGangTotals(fromUser.gangId);
        await updateGangTotals(toUser.gangId);

        return {
            success: true,
            message: `Successfully transferred ${amount} $CASH to the user. Your new balance: ${fromUser.cash} $CASH`
        };
    } catch (error) {
        console.error('Error transferring cash:', error);
        return { success: false, message: 'Error transferring cash. Please try again later.' };
    }
}

module.exports = {
    handleMessagePoints,
    awardCash,
    removeCash,
    awardTrophy,
    removeTrophy,
    updateGangTotals,
    resetWeeklyStats,
    transferCash
}; 