const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const User = require('../models/User');
const Gang = require('../models/Gang');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('leaderboard')
        .setDescription('Show leaderboards for members and gangs')
        .addStringOption(option =>
            option.setName('type')
                .setDescription('Type of leaderboard to show')
                .setRequired(true)
                .addChoices(
                    { name: 'Members (All)', value: 'members' },
                    { name: 'Gangs', value: 'gangs' },
                    { name: 'Sea Kings', value: 'seakings' },
                    { name: 'Thunder Birds', value: 'thunderbirds' },
                    { name: 'Fluffy Ninjas', value: 'fluffyninjas' },
                    { name: 'Chunky Cats', value: 'chunkycats' },
                    { name: 'Mad Gang', value: 'madgang' }
                ))
        .addBooleanOption(option =>
            option.setName('weekly')
                .setDescription('Show weekly leaderboard instead of total')
                .setRequired(false)),

    async execute(interaction) {
        const type = interaction.options.getString('type');
        const isWeekly = interaction.options.getBoolean('weekly') || false;

        // Defer reply to handle potentially slow database operations
        await interaction.deferReply();

        let embed;

        switch (type) {
            case 'members':
                embed = await getMembersLeaderboard(isWeekly);
                break;
            case 'gangs':
                embed = await getGangsLeaderboard(isWeekly);
                break;
            case 'seakings':
                embed = await getGangMembersLeaderboard('Sea Kings', isWeekly);
                break;
            case 'thunderbirds':
                embed = await getGangMembersLeaderboard('Thunder Birds', isWeekly);
                break;
            case 'fluffyninjas':
                embed = await getGangMembersLeaderboard('Fluffy Ninjas', isWeekly);
                break;
            case 'chunkycats':
                embed = await getGangMembersLeaderboard('Chunky Cats', isWeekly);
                break;
            case 'madgang':
                embed = await getGangMembersLeaderboard('Mad Gang', isWeekly);
                break;
            default:
                embed = new EmbedBuilder()
                    .setTitle('Invalid leaderboard type')
                    .setDescription('Please select a valid leaderboard type')
                    .setColor('#FF0000');
        }

        await interaction.editReply({ embeds: [embed] });
    },
};

// Helper function to get members leaderboard
async function getMembersLeaderboard(isWeekly) {
    const users = await User.find()
        .sort({ [isWeekly ? 'weeklyCash' : 'cash']: -1 })
        .limit(10);

    const gangs = await Gang.find();

    const embed = new EmbedBuilder()
        .setTitle(`${isWeekly ? 'Weekly' : 'Total'} Members Leaderboard`)
        .setDescription(`Top 10 members by ${isWeekly ? 'weekly' : 'total'} $CASH`)
        .setColor('#FFD700')
        .setTimestamp();

    if (users.length === 0) {
        embed.addFields({ name: 'No data', value: 'No members found' });
    } else {
        let description = '';

        users.forEach((user, index) => {
            const gangName = gangs.find(g => g.roleId === user.gangId)?.name || 'Unknown';
            description += `**${index + 1}. ${user.username}** (${gangName}): ${isWeekly ? user.weeklyCash : user.cash} $CASH\n`;
        });

        embed.setDescription(description);
    }

    return embed;
}

// Helper function to get gangs leaderboard
async function getGangsLeaderboard(isWeekly) {
    const gangs = await Gang.find()
        .sort({ [isWeekly ? 'weeklyTotalCash' : 'totalCash']: -1 });

    const embed = new EmbedBuilder()
        .setTitle(`${isWeekly ? 'Weekly' : 'Total'} Gangs Leaderboard`)
        .setDescription(`Gangs ranked by ${isWeekly ? 'weekly' : 'total'} $CASH`)
        .setColor('#4169E1')
        .setTimestamp();

    if (gangs.length === 0) {
        embed.addFields({ name: 'No data', value: 'No gangs found' });
    } else {
        let description = '';

        gangs.forEach((gang, index) => {
            description += `**${index + 1}. ${gang.name}**: ${isWeekly ? gang.weeklyTotalCash : gang.totalCash} $CASH | ${gang.trophies} Trophies\n`;
        });

        embed.setDescription(description);
    }

    return embed;
}

// Helper function to get members of a specific gang
async function getGangMembersLeaderboard(gangName, isWeekly) {
    const gang = await Gang.findOne({ name: gangName });

    if (!gang) {
        return new EmbedBuilder()
            .setTitle('Gang not found')
            .setDescription(`The gang "${gangName}" was not found.`)
            .setColor('#FF0000');
    }

    const users = await User.find({ gangId: gang.roleId })
        .sort({ [isWeekly ? 'weeklyCash' : 'cash']: -1 })
        .limit(10);

    const embed = new EmbedBuilder()
        .setTitle(`${gangName} - ${isWeekly ? 'Weekly' : 'Total'} Leaderboard`)
        .setDescription(`Top 10 ${gangName} members by ${isWeekly ? 'weekly' : 'total'} $CASH`)
        .setColor('#32CD32')
        .setTimestamp();

    if (users.length === 0) {
        embed.addFields({ name: 'No data', value: `No members found in ${gangName}` });
    } else {
        let description = '';

        users.forEach((user, index) => {
            description += `**${index + 1}. ${user.username}**: ${isWeekly ? user.weeklyCash : user.cash} $CASH\n`;
        });

        embed.setDescription(description);
    }

    return embed;
} 