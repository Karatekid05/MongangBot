// Message points settings
const POINTS_PER_MESSAGE = 10;
const MESSAGE_COOLDOWN_MS = 30 * 1000; // 30 seconds

// NFT rewards
const NFT_COLLECTION1_DAILY_REWARD = 500;
const NFT_COLLECTION2_DAILY_REWARD = 100;

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
    }
];

// Additional chat channels that award points
const ADDITIONAL_CHAT_CHANNELS = [
    '1353041020018757743', // newbies chat
    '1353041214890446898'  // general-chat
];

// Award sources
const AWARD_SOURCES = ['games', 'memesAndArt', 'chatActivity', 'others'];

module.exports = {
    POINTS_PER_MESSAGE,
    MESSAGE_COOLDOWN_MS,
    NFT_COLLECTION1_DAILY_REWARD,
    NFT_COLLECTION2_DAILY_REWARD,
    GANGS,
    AWARD_SOURCES,
    ADDITIONAL_CHAT_CHANNELS
}; 