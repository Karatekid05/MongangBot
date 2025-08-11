const User = require('../models/User');
const Gang = require('../models/Gang');
const { POINTS_PER_MESSAGE, MESSAGE_COOLDOWN_MS, GANGS, ADDITIONAL_CHAT_CHANNELS, getUserGangWithPriority } = require('./constants');
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
                // Verificar se o usuário pertence a alguma gang (com prioridade para Mad Gang)
                let userGang = getUserGangWithPriority(member);

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
                // Check all gangs to find one the user belongs to (with Mad Gang priority)
                let userGang = getUserGangWithPriority(member);

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
        user.pointsBySource.chatActivity += POINTS_PER_MESSAGE;
        user.weeklyPointsBySource.chatActivity += POINTS_PER_MESSAGE;
        user.lastMessageReward = now;

        // Update weekly cash to reflect all sources
        await updateWeeklyCash(user.userId);

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
        },
        weeklyPointsBySource: {
            games: 0,
            memesAndArt: 0,
            chatActivity: 0,
            others: 0,
            nftRewards: 0
        }
    });
}

/**
 * Reset weekly stats
 */
async function resetWeeklyStats() {
    try {
        // Reset user weekly stats
        await User.updateMany({}, {
            weeklyCash: 0,
            'weeklyPointsBySource.games': 0,
            'weeklyPointsBySource.memesAndArt': 0,
            'weeklyPointsBySource.chatActivity': 0,
            'weeklyPointsBySource.others': 0,
            'weeklyPointsBySource.nftRewards': 0
        });

        // Reset gang weekly stats
        await Gang.updateMany({}, { weeklyTotalCash: 0 });

        return true;
    } catch (error) {
        console.error('Error resetting weekly stats:', error);
        return false;
    }
}

/**
 * Update weekly cash based on all sources
 * @param {string} userId - Discord user ID
 */
async function updateWeeklyCash(userId) {
    try {
        const user = await User.findOne({ userId });
        if (!user) return false;

        if (!user.weeklyPointsBySource) {
            console.error(`User ${user.username} missing weeklyPointsBySource object`);
            // Initialize if missing
            user.weeklyPointsBySource = {
                games: 0,
                memesAndArt: 0,
                chatActivity: 0,
                others: 0,
                nftRewards: 0
            };
        }

        // Calculate total from all weekly sources
        const totalWeeklyCash =
            (user.weeklyPointsBySource.games || 0) +
            (user.weeklyPointsBySource.memesAndArt || 0) +
            (user.weeklyPointsBySource.chatActivity || 0) +
            (user.weeklyPointsBySource.others || 0) +
            (user.weeklyPointsBySource.nftRewards || 0);

        console.log(`Updating weekly cash for ${user.username}: ${totalWeeklyCash} (games: ${user.weeklyPointsBySource.games || 0}, memes: ${user.weeklyPointsBySource.memesAndArt || 0}, chat: ${user.weeklyPointsBySource.chatActivity || 0}, others: ${user.weeklyPointsBySource.others || 0}, nft: ${user.weeklyPointsBySource.nftRewards || 0})`);

        // Update weekly cash
        user.weeklyCash = totalWeeklyCash;
        await user.save();

        // Update gang totals
        await updateGangTotals(user.gangId);

        return true;
    } catch (error) {
        console.error('Error updating weekly cash:', error);
        return false;
    }
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

        // Award points to total cash
        user.cash += amount;
        user.weeklyCash += amount;

        // Track the source for both total and weekly
        if (source && user.pointsBySource[source] !== undefined) {
            user.pointsBySource[source] += amount;
            user.weeklyPointsBySource[source] += amount;
        } else {
            // If source is not specified or invalid, use 'others'
            user.pointsBySource.others += amount;
            user.weeklyPointsBySource.others += amount;
        }

        // Save user
        await user.save();

        // Update gang totals
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
 * @param {string} source - Source to remove points from (games, memesAndArt, chatActivity, others, nftRewards)
 */
async function removeCash(userId, amount, source = 'others') {
    try {
        // Find user
        const user = await User.findOne({ userId });
        if (!user) return { success: false, message: 'User not found in the system' };

        // Verificar se o source é 'proportional' (quando null é passado para esta função)
        const isProportional = !source || source === 'proportional';

        // Se não for proporcional, verificar se há pontos suficientes na fonte especificada
        if (!isProportional && user.pointsBySource[source] < amount) {
            return {
                success: false,
                message: `Not enough points in source '${source}'. Available: ${user.pointsBySource[source]}, Requested: ${amount}`
            };
        }

        // Remove points from total cash and weekly cash
        const prevCash = user.cash;
        const prevWeeklyCash = user.weeklyCash || 0;
        user.cash = Math.max(0, user.cash - amount);
        // Calculate actual amount removed from total (in case user had less than amount)
        const actualAmountRemoved = prevCash - user.cash;
        // Apply same removal to weekly cash, clamped
        user.weeklyCash = Math.max(0, prevWeeklyCash - actualAmountRemoved);

        // Also remove from point sources (proporcional ou específico)
        if (!isProportional && user.pointsBySource[source] !== undefined) {
            // Remove from specific source (total)
            user.pointsBySource[source] = Math.max(0, user.pointsBySource[source] - actualAmountRemoved);
            // Remove from weekly source as well
            if (user.weeklyPointsBySource && user.weeklyPointsBySource[source] !== undefined) {
                const weeklyBefore = user.weeklyPointsBySource[source] || 0;
                const weeklyRemoval = Math.min(weeklyBefore, actualAmountRemoved);
                user.weeklyPointsBySource[source] = weeklyBefore - weeklyRemoval;
            }
        } else {
            // Distribute removal proportionally across total sources
            const sources = Object.keys(user.pointsBySource);

            // Calculate total points from all sources for proportional distribution
            const totalPoints = Object.values(user.pointsBySource).reduce((sum, val) => sum + val, 0);

            if (totalPoints === 0) {
                return {
                    success: false,
                    message: `User has 0 points in all sources. Cannot remove points proportionally.`
                };
            }

            // Primeira passagem: distribuição proporcional e cálculo dos valores exatos
            let amountsToRemove = {};
            let totalToRemove = 0;

            for (const src of sources) {
                if (user.pointsBySource[src] > 0) {
                    const proportion = user.pointsBySource[src] / totalPoints;
                    const exactAmount = actualAmountRemoved * proportion;
                    amountsToRemove[src] = exactAmount;
                    totalToRemove += exactAmount;
                }
            }

            // Segunda passagem: ajuste e remoção real (total) e espelhar no weekly
            let remainingToRemove = actualAmountRemoved;
            let removedPerSource = {};

            for (const src of sources) {
                if (user.pointsBySource[src] > 0 && amountsToRemove[src] > 0) {
                    const adjustedAmount = src === sources[sources.length - 1]
                        ? remainingToRemove
                        : Math.min(
                            user.pointsBySource[src],
                            Math.floor(amountsToRemove[src])
                        );

                    const finalAmount = Math.max(0, Math.min(adjustedAmount, user.pointsBySource[src]));

                    // Remove from total source
                    user.pointsBySource[src] -= finalAmount;
                    remainingToRemove -= finalAmount;
                    removedPerSource[src] = (removedPerSource[src] || 0) + finalAmount;
                }
            }

            // Tratamento para eventuais pontos que restaram devido a arredondamentos (total)
            if (remainingToRemove > 0) {
                for (const src of sources) {
                    if (user.pointsBySource[src] > 0) {
                        const finalAmount = Math.min(user.pointsBySource[src], remainingToRemove);
                        user.pointsBySource[src] -= finalAmount;
                        remainingToRemove -= finalAmount;
                        removedPerSource[src] = (removedPerSource[src] || 0) + finalAmount;
                        if (remainingToRemove <= 0) break;
                    }
                }
            }

            // Espelhar as remoções no weeklyPointsBySource, respeitando limites
            if (user.weeklyPointsBySource) {
                for (const src of Object.keys(removedPerSource)) {
                    const weeklyBefore = user.weeklyPointsBySource[src] || 0;
                    const toRemoveWeekly = Math.min(weeklyBefore, removedPerSource[src]);
                    user.weeklyPointsBySource[src] = weeklyBefore - toRemoveWeekly;
                }
            }
        }

        // Save user
        await user.save();

        // Update gang totals only for current gang
        // Cash contributed to previous gangs remains untouched
        await updateGangTotals(user.gangId);

        return {
            success: true,
            amountRemoved: actualAmountRemoved,
            message: `Successfully removed ${actualAmountRemoved} $CASH from user.`
        };
    } catch (error) {
        console.error('Error removing cash:', error);
        return { success: false, amountRemoved: 0, message: 'Error removing cash. Please try again later.' };
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

/**
 * Transfer cash from one user to another
 * @param {string} fromUserId - Discord user ID to transfer from
 * @param {string} toUserId - Discord user ID to transfer to
 * @param {number} amount - Amount to transfer
 * @param {string} source - Source to transfer points from (games, memesAndArt, chatActivity, others, nftRewards) or 'proportional'
 */
async function transferCash(fromUserId, toUserId, amount, source = 'others') {
    try {
        // Check for self-transfer
        if (fromUserId === toUserId) {
            return { success: false, message: 'Cannot transfer to yourself' };
        }

        // Find sender
        const sender = await User.findOne({ userId: fromUserId });
        if (!sender) return { success: false, message: 'Sender not found in the system' };

        // Make sure sender has enough cash
        if (sender.cash < amount) {
            return { success: false, message: `Not enough $CASH. Available: ${sender.cash}, Requested: ${amount}` };
        }

        // Verificar se o source é 'proportional'
        const isProportional = !source || source === 'proportional';

        // Se não for proporcional, verificar se há pontos suficientes na fonte especificada
        if (!isProportional && sender.pointsBySource[source] < amount) {
            return {
                success: false,
                message: `Not enough points in source '${source}'. Available: ${sender.pointsBySource[source]}, Requested: ${amount}`
            };
        }

        // Find or create recipient
        let recipient = await User.findOne({ userId: toUserId });
        if (!recipient) {
            // Create new user
            recipient = new User({
                userId: toUserId,
                username: 'Unknown',
                cash: 0,
                weeklyCash: 0,
                // Initialize pointsBySource with zeros
                pointsBySource: {
                    games: 0,
                    memesAndArt: 0,
                    chatActivity: 0,
                    others: 0,
                    nftRewards: 0,
                },
                weeklyPointsBySource: {
                    games: 0,
                    memesAndArt: 0,
                    chatActivity: 0,
                    others: 0,
                    nftRewards: 0,
                }
            });
        }

        // Armazenar o source original para adicionar no destinatário
        const targetSource = source && source !== 'proportional' ? source : 'others';

        // Remove from sender - always remove the full amount from total cash
        sender.cash -= amount;
        sender.weeklyCash = Math.max(0, sender.weeklyCash - amount);

        // Remove from sender's point sources (proporcional ou específico)
        if (!isProportional && sender.pointsBySource[source] !== undefined) {
            // Remove from specific source
            sender.pointsBySource[source] -= amount;
            if (sender.weeklyPointsBySource[source] > 0) {
                const weeklyAmount = Math.min(sender.weeklyPointsBySource[source], amount);
                sender.weeklyPointsBySource[source] -= weeklyAmount;
            }
        } else {
            // Distribute removal proportionally across sources
            const sources = Object.keys(sender.pointsBySource);

            // Calculate total points from all sources for proportional distribution
            const totalPoints = Object.values(sender.pointsBySource).reduce((sum, val) => sum + val, 0);

            if (totalPoints === 0) {
                return {
                    success: false,
                    message: `Sender has 0 points in all sources. Cannot transfer points proportionally.`
                };
            }

            // Primeira passagem: distribuição proporcional e cálculo dos valores exatos
            let amountsToRemove = {};
            let totalToRemove = 0;

            for (const src of sources) {
                if (sender.pointsBySource[src] > 0) {
                    // Calculate proportion of points to remove from this source
                    const proportion = sender.pointsBySource[src] / totalPoints;
                    // Use valores exatos (sem arredondamento ainda)
                    const exactAmount = amount * proportion;

                    // Armazenar para processamento posterior
                    amountsToRemove[src] = exactAmount;
                    totalToRemove += exactAmount;
                }
            }

            // Segunda passagem: ajuste e remoção real
            let remainingToRemove = amount;

            for (const src of sources) {
                if (sender.pointsBySource[src] > 0 && amountsToRemove[src] > 0) {
                    // Calcular o valor ajustado (com possível arredondamento)
                    // para garantir que o total removido seja exatamente igual ao montante
                    const adjustedAmount = src === sources[sources.length - 1]
                        ? remainingToRemove  // último source pega o resto
                        : Math.min(
                            sender.pointsBySource[src],
                            Math.floor(amountsToRemove[src])
                        );

                    // Não permitir valores negativos
                    const finalAmount = Math.max(0, Math.min(adjustedAmount, sender.pointsBySource[src]));

                    // Remover do source
                    sender.pointsBySource[src] -= finalAmount;
                    remainingToRemove -= finalAmount;

                    // Atualizar também o semanal
                    if (sender.weeklyPointsBySource[src] > 0) {
                        const weeklyAmount = Math.min(sender.weeklyPointsBySource[src], finalAmount);
                        sender.weeklyPointsBySource[src] -= weeklyAmount;
                    }
                }
            }

            // Tratamento para eventuais pontos que restaram devido a arredondamentos
            if (remainingToRemove > 0) {
                for (const src of sources) {
                    if (sender.pointsBySource[src] > 0) {
                        const finalAmount = Math.min(sender.pointsBySource[src], remainingToRemove);
                        sender.pointsBySource[src] -= finalAmount;
                        remainingToRemove -= finalAmount;

                        if (sender.weeklyPointsBySource[src] > 0) {
                            const weeklyAmount = Math.min(sender.weeklyPointsBySource[src], finalAmount);
                            sender.weeklyPointsBySource[src] -= weeklyAmount;
                        }

                        if (remainingToRemove <= 0) break;
                    }
                }
            }
        }

        // Add to recipient
        recipient.cash += amount;
        recipient.weeklyCash += amount;

        // Add to recipient's point sources
        recipient.pointsBySource[targetSource] += amount;
        recipient.weeklyPointsBySource[targetSource] += amount;

        // Save both users
        await Promise.all([sender.save(), recipient.save()]);

        // Update gang totals for both users
        await Promise.all([
            updateGangTotals(sender.gangId),
            updateGangTotals(recipient.gangId)
        ]);

        // Incluir informação sobre o saldo atual do remetente
        const senderNewBalance = sender.cash;

        return {
            success: true,
            message: `Successfully transferred ${amount} $CASH from <@${fromUserId}> to <@${toUserId}>. Your new balance: ${senderNewBalance}`
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