/**
 * Utility for checking moderator permissions
 */

// Role IDs para membros da equipe que não devem ganhar pontos
// Hardcoded para garantir consistência com pointsManager.js
const TEAM_ROLE_IDS = [
    '1339293248308641883', // Founders
    '1338993206112817283', // Moderators
    '1353403238241669132'  // Additional moderator role
];

/**
 * Check if a member has moderator permissions
 * @param {GuildMember} member - The Discord member to check
 * @returns {boolean} - True if the member is a moderator
 */
function isModerator(member) {
    // Array of moderator role IDs from .env file
    const modRoleIds = process.env.MOD_ROLE_IDS ? process.env.MOD_ROLE_IDS.split(',') : [];

    // Verificação principal: verificar se o usuário tem algum dos roles da equipe
    const hasModRole = TEAM_ROLE_IDS.some(roleId => member.roles.cache.has(roleId));

    // Verificação de backup: usar os roles do .env (deve corresponder ao TEAM_ROLE_IDS)
    const hasEnvModRole = modRoleIds.some(roleId => member.roles.cache.has(roleId.trim()));

    if (hasModRole) {
        console.log(`User ${member.user.username} has mod role (hardcoded check)`);
    }

    if (hasEnvModRole) {
        console.log(`User ${member.user.username} has mod role (env check)`);
    }

    // Retornar true se alguma das verificações for bem-sucedida
    return hasModRole || hasEnvModRole;
}

module.exports = {
    isModerator
}; 