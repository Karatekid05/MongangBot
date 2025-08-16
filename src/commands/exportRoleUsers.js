const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');
const { isModerator } = require('../utils/permissions');
const User = require('../models/User');

// Same path strategy used by utils/googleSheets.js
const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];
const SERVICE_ACCOUNT_FILE = path.join(process.cwd(), 'diesel-thunder-455312-u0-4c03bcf3d2ca.json');

async function getSheetsClient() {
    if (!process.env.GOOGLE_SHEETS_SPREADSHEET_ID) {
        throw new Error('GOOGLE_SHEETS_SPREADSHEET_ID not set in environment');
    }

    if (!fs.existsSync(SERVICE_ACCOUNT_FILE)) {
        throw new Error(`Service account file not found at: ${SERVICE_ACCOUNT_FILE}`);
    }

    const auth = new google.auth.GoogleAuth({
        keyFile: SERVICE_ACCOUNT_FILE,
        scopes: SCOPES
    });
    const client = await auth.getClient();
    return google.sheets({ version: 'v4', auth: client });
}

function defaultSheetName(roleId) {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `Role_${roleId}_${y}-${m}-${day}`;
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('export-role-users')
        .setDescription('Export all users with a given role ID to Google Sheets')
        .addStringOption(opt =>
            opt.setName('roleid')
                .setDescription('Discord Role ID to export')
                .setRequired(true)
        )
        .addStringOption(opt =>
            opt.setName('sheet')
                .setDescription('Target sheet name (optional, default: Role_<ID>_<date>)')
                .setRequired(false)
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),

    async execute(interaction) {
        try {
            if (!isModerator(interaction.member)) {
                return interaction.reply({ content: 'This command is only available to moderators.', ephemeral: true });
            }

            await interaction.deferReply({ ephemeral: true });

            const roleId = interaction.options.getString('roleid');
            const sheetName = interaction.options.getString('sheet') || defaultSheetName(roleId);

            const guildId = process.env.DISCORD_GUILD_ID;
            if (!guildId) {
                return interaction.editReply('DISCORD_GUILD_ID is not configured.');
            }

            const guild = await interaction.client.guilds.fetch(guildId);
            await guild.members.fetch();

            const members = guild.members.cache
                .filter(m => !m.user.bot && m.roles.cache.has(roleId))
                .map(m => ({ username: m.user.username, userId: m.user.id }));

            if (members.length === 0) {
                return interaction.editReply(`No users found with role ${roleId}.`);
            }

            // Enrich with wallet addresses for users who had linked wallets
            const userIds = members.map(m => m.userId);
            const usersWithWallets = await User.find(
                { userId: { $in: userIds } },
                { userId: 1, walletAddress: 1 }
            ).lean();
            const idToWallet = new Map(usersWithWallets.map(u => [u.userId, u.walletAddress || '']));

            const sheets = await getSheetsClient();
            const spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;

            // Ensure the sheet exists
            const spreadsheetInfo = await sheets.spreadsheets.get({ spreadsheetId });
            const existingSheets = new Set((spreadsheetInfo.data.sheets || []).map(s => s.properties.title));
            if (!existingSheets.has(sheetName)) {
                await sheets.spreadsheets.batchUpdate({
                    spreadsheetId,
                    resource: { requests: [{ addSheet: { properties: { title: sheetName } } }] }
                });
            }

            // Prepare values
            const values = [
                ['Username', 'Discord ID', 'Wallet'],
                ...members.map(m => [m.username, m.userId, idToWallet.get(m.userId) || ''])
            ];

            // Write into A1:B
            await sheets.spreadsheets.values.update({
                spreadsheetId,
                range: `'${sheetName}'!A1:C${values.length}`,
                valueInputOption: 'RAW',
                resource: { values }
            });

            await interaction.editReply(`✅ Exported ${members.length} users with role ${roleId} to sheet "${sheetName}".`);
        } catch (error) {
            console.error('Error exporting role users:', error);
            const msg = error?.message || 'Unknown error';
            if (interaction.deferred) {
                await interaction.editReply(`❌ Failed to export: ${msg}`);
            } else {
                await interaction.reply({ content: `❌ Failed to export: ${msg}`, ephemeral: true });
            }
        }
    }
};


