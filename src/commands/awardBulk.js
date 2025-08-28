const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { awardCash } = require('../utils/pointsManager');
const { AWARD_SOURCES, GANGS, getUserGangWithPriority } = require('../utils/constants');
const { isModerator } = require('../utils/permissions');
const User = require('../models/User');

function escapeRegex(text) {
    return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('award-bulk')
        .setDescription('Award $CASH to multiple users by username list (Moderator only)')
        .addStringOption(option =>
            option.setName('usernames')
                .setDescription('Multiline list of usernames (one per line).')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('source')
                .setDescription('Source of the award')
                .setRequired(true)
                .addChoices(
                    { name: 'Games', value: 'games' },
                    { name: 'Memes & Art', value: 'memesAndArt' },
                    { name: 'Chat Activity', value: 'chatActivity' },
                    { name: 'Others', value: 'others' }
                ))
        .addIntegerOption(option =>
            option.setName('amount')
                .setDescription('Amount of $CASH to award per user')
                .setRequired(true)
                .setMinValue(1))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),

    async execute(interaction, client) {
        // Check if user has moderator role
        if (!isModerator(interaction.member)) {
            return interaction.reply({
                content: 'You do not have permission to use this command. This command is for moderators only.',
                ephemeral: true
            });
        }

        const usernamesRaw = interaction.options.getString('usernames');
        const source = interaction.options.getString('source');
        const amount = interaction.options.getInteger('amount');

        // Validate inputs
        if (amount <= 0) {
            return interaction.reply({
                content: 'Amount must be a positive number',
                ephemeral: true
            });
        }

        if (!AWARD_SOURCES.includes(source)) {
            return interaction.reply({
                content: 'Invalid source',
                ephemeral: true
            });
        }

        // Parse usernames list
        const parsedNames = usernamesRaw
            .split(/\r?\n|,/) // split by linebreaks or commas
            .map(s => s.trim())
            .filter(s => s.length > 0);

        if (parsedNames.length === 0) {
            return interaction.reply({
                content: 'No valid usernames provided.',
                ephemeral: true
            });
        }

        // Defer reply to handle potentially slow database operations
        await interaction.deferReply();

        // Ensure guild members are cached for username lookups
        try { await interaction.guild.members.fetch(); } catch {}

        const results = [];

        for (const name of parsedNames) {
            try {
                // Try to find user by username (case-insensitive)
                const userDoc = await User.findOne({ username: { $regex: new RegExp('^' + escapeRegex(name) + '$', 'i') } });

                let effectiveUser = userDoc;
                let createdUser = false;

                if (!effectiveUser) {
                    // Try to find a guild member by username match
                    const memberMatch = interaction.guild.members.cache.find(m => m.user && m.user.username && m.user.username.toLowerCase() === name.toLowerCase());

                    if (!memberMatch) {
                        results.push(`❌ Could not find member ${name} in the server.`);
                        continue;
                    }

                    // Try to determine gang and create the user like /award
                    const userGang = getUserGangWithPriority(memberMatch);
                    if (!userGang) {
                        results.push(`${memberMatch.user.username} does not belong to any gang. Assign a gang role to this user first.`);
                        continue;
                    }

                    try {
                        const newUser = new User({
                            userId: memberMatch.id,
                            username: memberMatch.user.username,
                            gangId: userGang.roleId,
                            cash: 0,
                            weeklyCash: 0,
                            lastMessageReward: new Date(0)
                        });

                        await newUser.save();
                        effectiveUser = newUser;
                        createdUser = true;
                        console.log(`New user registered via /award-bulk: ${memberMatch.user.username} in gang ${userGang.name}`);
                    } catch (error) {
                        console.error(`Error creating user ${memberMatch.user.username}:`, error);
                        results.push(`Error registering ${memberMatch.user.username}. Please try again.`);
                        continue;
                    }
                }

                // Award the cash
                const success = await awardCash(effectiveUser.userId, source, amount);

                if (success) {
                    results.push(`✅ Successfully awarded ${amount} $CASH to ${effectiveUser.username} from source: ${source}`);
                } else {
                    results.push('Failed to award $CASH. Please contact a developer to check the logs.');
                }
            } catch (error) {
                console.error(`Error processing ${name}:`, error);
                results.push(`❌ Error processing ${name}.`);
            }
        }

        // Compose final response
        const successCount = results.filter(r => r.startsWith('✅')).length;
        const failCount = results.length - successCount;

        const header = `Completed bulk award. Success: ${successCount}, Failures: ${failCount}`;
        const body = results.join('\n');

        await interaction.editReply(`${header}\n\n${body}`);
    },
};


