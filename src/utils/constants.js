// Message points settings
const POINTS_PER_MESSAGE = 10;
const MESSAGE_COOLDOWN_MS = 30 * 1000; // 30 seconds

// NFT rewards - valores fixos independentemente da quantidade de NFTs
const NFT_COLLECTION1_DAILY_REWARD = 150; // 150 $CASH/day for Collection 1
const NFT_COLLECTION2_DAILY_REWARD = 50;  // 50 $CASH/day for Collection 2

// Collection 3 (HaHa x MonGang Pass) role assignment (no cash)
const COLLECTION3_NAME = 'HaHa x MonGang Pass';
const COLLECTION3_ROLE_ID = '1402656276441469050';
const COLLECTION3_CONTRACT_ADDRESS = '0xfe5b5af24280af7ea190a41d0240fe30c46f1c40';

// Matrica verification roles (role-based rewards)
const MATRICA_CASH_50_ROLE_ID = '1406329826461352120';
const MATRICA_CASH_150_ROLE_ID = '1406330019936211164';

// Gang data
const GANGS = [
    {
        name: 'Sea Kings',
        roleId: '1353403611106770967', // Sea Kings role ID
        channelId: '1349463574803906662' // Sea Kings channel ID
    },
    {
        name: 'Thunder Birds',
        roleId: '1353403620602941500', // Thunder Birds role ID
        channelId: '1349463616365006849' // Thunder Birds channel ID
    },
    {
        name: 'Fluffy Ninjas',
        roleId: '1353403632187346954', // Fluffy Ninjas role ID
        channelId: '1349463693758562304' // Fluffy Ninjas channel ID
    },
    {
        name: 'Chunky Cats',
        roleId: '1353403626168516668', // Chunky Cats role ID
        channelId: '1349463663949516951' // Chunky Cats channel ID
    },
    {
        name: 'Mad Gang',
        roleId: '1395161421507072033', // Mad Gang role ID
        channelId: '1395166171694764113' // Mad Gang channel ID
    }
];

// Mad Gang has priority over all other gangs
const MAD_GANG_ROLE_ID = '1395161421507072033';

// Additional chat channels that award points
const ADDITIONAL_CHAT_CHANNELS = [
    '1353041020018757743', // newbies chat
    '1353041214890446898'  // general-chat
];

// Award sources
const AWARD_SOURCES = ['games', 'memesAndArt', 'chatActivity', 'others'];

// Purchase requirement roles
const FASTSHOTER_ROLE_ID = '1353402683247165561';
const CAPO_ROLE_ID = '1353402893532659732';

/**
 * Determine user's gang with priority system (Mad Gang takes priority)
 * @param {GuildMember} member - Discord guild member
 * @returns {Object|null} - Gang object or null if no gang found
 */
function getUserGangWithPriority(member) {
    // First check if user has Mad Gang role - it takes priority
    if (member.roles.cache.has(MAD_GANG_ROLE_ID)) {
        return GANGS.find(gang => gang.roleId === MAD_GANG_ROLE_ID);
    }
    
    // If not Mad Gang, check other gangs in order
    for (const gang of GANGS) {
        if (gang.roleId !== MAD_GANG_ROLE_ID && member.roles.cache.has(gang.roleId)) {
            return gang;
        }
    }
    
    return null;
}

/**
 * Get all gang roles that a user has (for cleanup purposes)
 * @param {GuildMember} member - Discord guild member
 * @returns {Array} - Array of gang role IDs that the user has
 */
function getUserGangRoles(member) {
    const userGangRoles = [];
    for (const gang of GANGS) {
        if (member.roles.cache.has(gang.roleId)) {
            userGangRoles.push(gang.roleId);
        }
    }
    return userGangRoles;
}

module.exports = {
    POINTS_PER_MESSAGE,
    MESSAGE_COOLDOWN_MS,
    NFT_COLLECTION1_DAILY_REWARD,
    NFT_COLLECTION2_DAILY_REWARD,
    GANGS,
    MAD_GANG_ROLE_ID,
    AWARD_SOURCES,
    ADDITIONAL_CHAT_CHANNELS,
    FASTSHOTER_ROLE_ID,
    CAPO_ROLE_ID,
    COLLECTION3_NAME,
    COLLECTION3_ROLE_ID,
    COLLECTION3_CONTRACT_ADDRESS,
    MATRICA_CASH_50_ROLE_ID,
    MATRICA_CASH_150_ROLE_ID,
    getUserGangWithPriority,
    getUserGangRoles
}; 