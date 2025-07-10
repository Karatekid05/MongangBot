const { SlashCommandBuilder } = require('discord.js');
const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');
const { isModerator } = require('../utils/permissions');

// Google Sheets API setup
const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];
const SERVICE_ACCOUNT_FILE = path.join(process.cwd(), 'diesel-thunder-455312-u0-4c03bcf3d2ca.json');

/**
 * Get Google Sheets auth client using the service account JSON file
 */
async function getAuthClient() {
    try {
        console.log("Initializing Google Sheets auth client...");
        console.log(`Looking for credentials file at: ${SERVICE_ACCOUNT_FILE}`);

        // Check if the file exists
        if (!fs.existsSync(SERVICE_ACCOUNT_FILE)) {
            console.error(`Service account file not found at: ${SERVICE_ACCOUNT_FILE}`);
            return null;
        }

        // Create the auth client
        const auth = new google.auth.GoogleAuth({
            keyFile: SERVICE_ACCOUNT_FILE,
            scopes: SCOPES
        });

        const client = await auth.getClient();
        console.log("Google Sheets authentication successful!");
        return client;
    } catch (error) {
        console.error(`Authentication error: ${error.message}`);
        return null;
    }
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('exportusers')
        .setDescription('Export all server users to Google Sheets, organized by role hierarchy (Moderator only)'),

    async execute(interaction) {
        // Check if user has moderator permissions
        if (!isModerator(interaction.member)) {
            return interaction.reply({
                content: 'You do not have permission to use this command. This command is for moderators only.',
                ephemeral: true
            });
        }

        // Defer reply as this operation might take time
        await interaction.deferReply({ ephemeral: true });

        try {
            const guild = interaction.guild;
            
            // Fetch all guild members
            await guild.members.fetch();
            console.log(`Fetched ${guild.members.cache.size} members from the server`);

            // Get all roles and sort by position (hierarchy)
            const allRoles = guild.roles.cache
                .filter(role => role.name !== '@everyone') // Only exclude @everyone
                .sort((a, b) => b.position - a.position); // Sort by position (higher position = higher hierarchy)

            console.log(`Found ${allRoles.size} roles in the server (excluding @everyone)`);

            // Prepare data for Google Sheets
            const userData = [];

            // Process each member and find their highest role (excluding @everyone and Mongang lover)
            for (const [memberId, member] of guild.members.cache) {
                // Skip bots
                if (member.user.bot) continue;
                
                // Get all roles for this member (excluding @everyone and Mongang lover)
                const memberRoles = member.roles.cache
                    .filter(role => role.name !== '@everyone' && role.name !== 'Mongang lover 💜')
                    .sort((a, b) => b.position - a.position); // Sort by position (highest first)
                
                // Get the highest role for this member
                const highestRole = memberRoles.first();
                
                if (highestRole) {
                    // Member has a role other than @everyone and Mongang lover
                    userData.push({
                        Username: member.user.username,
                        Role: highestRole.name,
                        'Role Position': highestRole.position,
                        'User ID': member.user.id,
                        'Joined Server': member.joinedAt ? member.joinedAt.toLocaleDateString('en-US') : 'Unknown',
                        'Account Created': member.user.createdAt.toLocaleDateString('en-US')
                    });
                } else {
                    // Member has no roles other than @everyone (and possibly Mongang lover)
                    // Only add if they don't have Mongang lover role
                    const hasMongangLover = member.roles.cache.some(role => role.name === 'Mongang lover 💜');
                    if (!hasMongangLover) {
                        userData.push({
                            Username: member.user.username,
                            Role: 'No Role',
                            'Role Position': 0,
                            'User ID': member.user.id,
                            'Joined Server': member.joinedAt ? member.joinedAt.toLocaleDateString('en-US') : 'Unknown',
                            'Account Created': member.user.createdAt.toLocaleDateString('en-US')
                        });
                    }
                }
            }

            console.log(`Processed ${userData.length} members (excluding users with only Mongang lover role)`);

            // Sort by role position (descending) then by username
            userData.sort((a, b) => {
                if (a['Role Position'] !== b['Role Position']) {
                    return b['Role Position'] - a['Role Position'];
                }
                return a.Username.localeCompare(b.Username);
            });

            // Export to Google Sheets
            await interaction.editReply('📊 Exporting data to Google Sheets...');

            // Get auth client
            const auth = await getAuthClient();
            if (!auth) {
                throw new Error("Failed to get Google Sheets auth client");
            }

            // Create sheets client
            const sheets = google.sheets({ version: 'v4', auth });

            // Sheet name for server users
            const sheetName = 'Server_Users';

            console.log(`Exporting to sheet: ${sheetName}`);
            console.log(`Using spreadsheet ID: ${process.env.GOOGLE_SHEETS_SPREADSHEET_ID}`);

            // First, ensure the sheet exists
            try {
                const spreadsheetInfo = await sheets.spreadsheets.get({
                    spreadsheetId: process.env.GOOGLE_SHEETS_SPREADSHEET_ID
                });

                const existingSheets = spreadsheetInfo.data.sheets.map(sheet => sheet.properties.title);
                console.log('Available sheets:', existingSheets.join(', '));

                // Check if required sheet exists, create it if not
                if (!existingSheets.includes(sheetName)) {
                    console.log(`Sheet ${sheetName} not found, creating it...`);
                    await sheets.spreadsheets.batchUpdate({
                        spreadsheetId: process.env.GOOGLE_SHEETS_SPREADSHEET_ID,
                        resource: {
                            requests: [{
                                addSheet: {
                                    properties: {
                                        title: sheetName
                                    }
                                }
                            }]
                        }
                    });
                    console.log(`Created sheet: ${sheetName}`);
                }
            } catch (error) {
                console.error('Error checking/creating sheet:', error);
                throw new Error(`Failed to access Google Sheets: ${error.message}`);
            }

            // Prepare data for Google Sheets format
            const sheetValues = [
                ['Username', 'Role', 'Role Position', 'User ID', 'Joined Server', 'Account Created'],
                ...userData.map(user => [
                    user.Username,
                    user.Role,
                    user['Role Position'],
                    user['User ID'],
                    user['Joined Server'],
                    user['Account Created']
                ])
            ];

            // Write data to Google Sheets
            await sheets.spreadsheets.values.update({
                spreadsheetId: process.env.GOOGLE_SHEETS_SPREADSHEET_ID,
                range: `'${sheetName}'!A1:F${sheetValues.length}`,
                valueInputOption: 'RAW',
                resource: {
                    values: sheetValues
                }
            });

            console.log(`Successfully exported ${userData.length} users to Google Sheets`);

            // Send success message
            await interaction.editReply({
                content: `✅ **Server Users Export Complete**\n\n` +
                        `📊 **Total Users:** ${userData.length}\n` +
                        `🏷️ **Total Roles:** ${allRoles.size}\n` +
                        `🏢 **Server:** ${guild.name}\n` +
                        `📅 **Generated:** ${new Date().toLocaleString('en-US')}\n` +
                        `📋 **Sheet:** ${sheetName}\n\n` +
                        `The data has been successfully exported to Google Sheets, organized by role hierarchy (highest roles first).\n\n` +
                        `**Note:** Users with only "Mongang lover 💜" role were excluded from the export.`
            });

        } catch (error) {
            console.error('Error exporting users:', error);
            await interaction.editReply({
                content: `❌ **Error exporting users:** ${error.message}\n\nPlease check the bot logs for more details.`
            });
        }
    }
}; 