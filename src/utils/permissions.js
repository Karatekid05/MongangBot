/**
 * Utility for checking moderator permissions
 */

/**
 * Check if a member has moderator permissions
 * @param {GuildMember} member - The Discord member to check
 * @returns {boolean} - True if the member is a moderator
 */
function isModerator(member) {
    // Array of moderator role IDs from .env file
    const modRoleIds = process.env.MOD_ROLE_IDS ? process.env.MOD_ROLE_IDS.split(',') : [];

    // Check if the user has any of the moderator roles
    return modRoleIds.some(roleId => member.roles.cache.has(roleId.trim()));
}

module.exports = {
    isModerator
}; 