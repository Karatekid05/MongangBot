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
                .setDescription('List of usernames separated by newline, comma, or space.')
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
            .split(/[\s,]+/) // split by whitespace or commas
            .map(s => s.trim())
            .filter(s => s.length > 0);

        if (parsedNames.length === 0) {
            return interaction.reply({
                content: 'No valid usernames provided.',
                ephemeral: true
            });
        }

        // Defer reply (public) to handle potentially slow database operations
        await interaction.deferReply();

        // Ensure guild members are cached for username lookups
        try { await interaction.guild.members.fetch(); } catch {}

        const results = [];

        function normalize(str) {
            return (str || '').trim().toLowerCase();
        }
        function simplify(str) {
            return normalize(str).replace(/[^a-z0-9._-]/g, '');
        }

        function namesToTry(name) {
            const n = name.trim().replace(/^@+/, ''); // remove leading @
            const mentionMatch = n.match(/^<@!?\d+>$/);
            if (mentionMatch) return [n];
            const variants = new Set([n, n.replace(/\.$/, '')]); // try without trailing dot
            return Array.from(variants);
        }

        async function findMemberByName(name, guild) {
            const tries = namesToTry(name).map(normalize);
            const triesS = namesToTry(name).map(simplify);
            // If user provided a real mention <@id>, resolve directly
            const mention = namesToTry(name)[0];
            const idMatch = mention.match(/^<@!?(\d+)>$/);
            if (idMatch) {
                try { return await guild.members.fetch(idMatch[1]); } catch { return null; }
            }

            return guild.members.cache.find(m => {
                const u = m.user;
                const candidates = [
                    normalize(u?.username),
                    normalize(u?.globalName),
                    normalize(m.displayName),
                    normalize(u?.tag)
                ];
                const candidatesS = candidates.map(simplify);

                // exact normalized match
                if (tries.some(t => candidates.includes(t))) return true;
                // exact simplified match
                if (triesS.some(t => candidatesS.includes(t))) return true;
                // partial match (avoid very short tokens)
                return tries.some(t => t.length >= 3 && candidates.some(c => c.includes(t)))
                    || triesS.some(t => t.length >= 3 && candidatesS.some(c => c.includes(t)));
            });
        }

        // Inform start
        await interaction.editReply(`Processing ${parsedNames.length} users for ${amount} $CASH each (source: ${source})...`);

        for (const name of parsedNames) {
            try {
                // Prefer resolving by guild member first (handles renamed users)
                let memberMatch = await findMemberByName(name, interaction.guild);
                let effectiveUser = null;

                if (memberMatch) {
                    // Try DB by userId
                    effectiveUser = await User.findOne({ userId: memberMatch.id });
                    if (!effectiveUser) {
                        const userGang = getUserGangWithPriority(memberMatch);
                        if (!userGang) {
                            const line = `${memberMatch.user.username} does not belong to any gang. Assign a gang role to this user first.`;
                            results.push(line);
                            await interaction.followUp({ content: line });
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
                            console.log(`New user registered via /award-bulk: ${memberMatch.user.username} in gang ${userGang.name}`);
                        } catch (error) {
                            console.error(`Error creating user ${memberMatch.user.username}:`, error);
                            const line = `Error registering ${memberMatch.user.username}. Please try again.`;
                            results.push(line);
                            await interaction.followUp({ content: line });
                            continue;
                        }
                    }
                } else {
                    // Fallback: try DB by username (case-insensitive)
                    const plain = namesToTry(name)[0].replace(/^@+/, '');
                    const userDoc = await User.findOne({ username: { $regex: new RegExp('^' + escapeRegex(plain) + '$', 'i') } });
                    if (!userDoc) {
                        const line = `❌ Could not find member ${plain} in the server.`;
                        results.push(line);
                        await interaction.followUp({ content: line });
                        continue;
                    }
                    effectiveUser = userDoc;
                }

                // Award the cash
                const success = await awardCash(effectiveUser.userId, source, amount);

                if (success) {
                    const line = `✅ Successfully awarded ${amount} $CASH to ${effectiveUser.username} from source: ${source}`;
                    results.push(line);
                    await interaction.followUp({ content: line });
                } else {
                    const line = 'Failed to award $CASH. Please contact a developer to check the logs.';
                    results.push(line);
                    await interaction.followUp({ content: line });
                }
            } catch (error) {
                console.error(`Error processing ${name}:`, error);
                const line = `❌ Error processing ${name}.`;
                results.push(line);
                await interaction.followUp({ content: line });
            }
        }

        // Compose final response
        const successCount = results.filter(r => r.startsWith('✅')).length;
        const failCount = results.length - successCount;

        const header = `Completed bulk award. Success: ${successCount}, Failures: ${failCount}`;
        await interaction.editReply(header);
    },
};


