const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { awardCash } = require('../utils/pointsManager');
const { AWARD_SOURCES, GANGS, getUserGangWithPriority } = require('../utils/constants');
const { isModerator } = require('../utils/permissions');
const User = require('../models/User');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('award')
        .setDescription('Award $CASH to a user (Moderator only)')
        .addUserOption(option =>
            option.setName('user')
                .setDescription('The user to award $CASH to')
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
                .setDescription('Amount of $CASH to award')
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

        const targetUser = interaction.options.getUser('user');
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

        // Defer reply to handle potentially slow database operations
        await interaction.deferReply();

        // Check if the user exists in the database
        let userData = await User.findOne({ userId: targetUser.id });

        // If the user doesn't exist, try to create them
        if (!userData) {
            try {
                // Fetch the Discord member to check roles
                const member = await interaction.guild.members.fetch(targetUser.id).catch(err => {
                    console.error(`Could not fetch member ${targetUser.id}:`, err);
                    return null;
                });

                if (!member) {
                    return interaction.editReply(`Could not find member ${targetUser.username} in the server.`);
                }

                // Check all gangs to find one the user belongs to (with Mad Gang priority)
                const userGang = getUserGangWithPriority(member);

                if (!userGang) {
                    return interaction.editReply(`${targetUser.username} does not belong to any gang. Assign a gang role to this user first.`);
                }

                // Create the user in the database
                userData = new User({
                    userId: targetUser.id,
                    username: targetUser.username,
                    gangId: userGang.roleId,
                    cash: 0,
                    weeklyCash: 0,
                    lastMessageReward: new Date(0)
                });

                await userData.save();
                console.log(`New user registered via /award: ${targetUser.username} in gang ${userGang.name}`);
            } catch (error) {
                console.error(`Error creating user ${targetUser.username}:`, error);
                return interaction.editReply(`Error registering ${targetUser.username}. Please try again.`);
            }
        }

        // Award the cash
        const success = await awardCash(targetUser.id, source, amount);

        if (success) {
            await interaction.editReply(`Successfully awarded ${amount} $CASH to ${targetUser.username} from source: ${source}`);
        } else {
            await interaction.editReply('Failed to award $CASH. Please contact a developer to check the logs.');
        }
    },
}; 