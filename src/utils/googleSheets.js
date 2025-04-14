const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');
const User = require('../models/User');
const Gang = require('../models/Gang');

// Google Sheets API setup
const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];

// Path to service account credentials file - using absolute path
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
            console.log(`Current directory contents:`);
            const files = fs.readdirSync(process.cwd());
            console.log(files.join(', '));
            return null;
        }

        // File exists, now try to read it to verify
        try {
            const credential = JSON.parse(fs.readFileSync(SERVICE_ACCOUNT_FILE, 'utf8'));
            console.log('Successfully read credentials file');
            console.log(`Client email from file: ${credential.client_email}`);
        } catch (readError) {
            console.error(`Error reading credentials file: ${readError.message}`);
        }

        // Create the auth client
        try {
            const auth = new google.auth.GoogleAuth({
                keyFile: SERVICE_ACCOUNT_FILE,
                scopes: SCOPES
            });

            const client = await auth.getClient();
            console.log("Google Sheets authentication successful!");
            return client;
        } catch (authError) {
            console.error(`Authentication error: ${authError.message}`);
            if (authError.message.includes('error:1E08010C:DECODER')) {
                console.error('This error is related to key format issues. Check if the JSON file has been modified.');
            }
            return null;
        }
    } catch (error) {
        console.error(`Unexpected error: ${error.message}`);
        return null;
    }
}

/**
 * Format date for sheet name
 * @returns {string} formatted date
 */
function getFormattedDate() {
    const date = new Date();
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

/**
 * Export leaderboard data to Google Sheets
 * @param {boolean} weekly - Export weekly data instead of total
 * @param {boolean} archived - Export to archive sheet instead of current
 * @returns {Promise<boolean>} - Success status
 */
async function exportLeaderboards(weekly = false, archived = false) {
    try {
        console.log('Starting export to Google Sheets...');

        // Get auth client
        const auth = await getAuthClient();
        if (!auth) {
            console.error("Failed to get auth client. Cannot export to Google Sheets");
            return false;
        }

        // Create sheets client
        const sheets = google.sheets({ version: 'v4', auth });

        // Get data
        const userData = await getLeaderboardData(weekly);
        const gangData = await getGangLeaderboardData(weekly);

        if (!userData.length) {
            console.warn('No user data found to export');
        }

        if (!gangData.length) {
            console.warn('No gang data found to export');
        }

        // Prepare data for Google Sheets format
        const usersValues = [
            ['User ID', 'Username', 'Gang', 'Cash', 'Games', 'Memes & Art', 'Chat', 'Others', 'NFT Rewards'],
            ...userData.map(user => [
                user.userId,
                user.username,
                user.gangName,
                user.cash,
                user.pointsBySource ? user.pointsBySource.games : 0,
                user.pointsBySource ? user.pointsBySource.memesAndArt : 0,
                user.pointsBySource ? user.pointsBySource.chatActivity : 0,
                user.pointsBySource ? user.pointsBySource.others : 0,
                user.pointsBySource ? user.pointsBySource.nftRewards : 0
            ])
        ];

        const gangsValues = [
            ['Gang', 'Total Cash', 'Trophies', 'Member Count'],
            ...gangData.map(gang => [
                gang.name,
                gang.totalCash,
                gang.trophies,
                gang.memberCount
            ])
        ];

        // Determine which sheets to update based on weekly/archived options
        const userSheetName = weekly ?
            (archived ? 'Weekly_Users_Archive' : 'Weekly_Users') :
            'Total_Users';

        const gangSheetName = weekly ?
            (archived ? 'Weekly_Gangs_Archive' : 'Weekly_Gangs') :
            'Total_Gangs';

        console.log(`Exporting to sheets: ${userSheetName} and ${gangSheetName}`);
        console.log(`Using spreadsheet ID: ${process.env.GOOGLE_SHEETS_SPREADSHEET_ID}`);

        try {
            // First, ensure the sheets exist by getting spreadsheet info
            const spreadsheetInfo = await sheets.spreadsheets.get({
                spreadsheetId: process.env.GOOGLE_SHEETS_SPREADSHEET_ID
            });

            console.log('Successfully retrieved spreadsheet information');
            const existingSheets = spreadsheetInfo.data.sheets.map(sheet => sheet.properties.title);
            console.log('Available sheets:', existingSheets.join(', '));

            // Check if required sheets exist, create them if not
            for (const sheetName of [userSheetName, gangSheetName]) {
                if (!existingSheets.includes(sheetName)) {
                    console.log(`Sheet ${sheetName} not found, creating it...`);
                    try {
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
                    } catch (createError) {
                        console.error(`Error creating sheet ${sheetName}:`, createError.message);
                    }
                }
            }

            // Write user data
            await sheets.spreadsheets.values.update({
                spreadsheetId: process.env.GOOGLE_SHEETS_SPREADSHEET_ID,
                range: `'${userSheetName}'!A1:I${usersValues.length}`,
                valueInputOption: 'RAW',
                resource: {
                    values: usersValues
                }
            });

            console.log(`Successfully exported ${userData.length} users to ${userSheetName}`);

            // Write gang data
            await sheets.spreadsheets.values.update({
                spreadsheetId: process.env.GOOGLE_SHEETS_SPREADSHEET_ID,
                range: `'${gangSheetName}'!A1:D${gangsValues.length}`,
                valueInputOption: 'RAW',
                resource: {
                    values: gangsValues
                }
            });

            console.log(`Successfully exported ${gangData.length} gangs to ${gangSheetName}`);
            console.log(`Done! All data exported to Google Sheets.`);
            return true;
        } catch (sheetsError) {
            console.error(`Error updating spreadsheet: ${sheetsError.message}`);
            if (sheetsError.message.includes('not found')) {
                console.error(`Make sure the sheet names "${userSheetName}" and "${gangSheetName}" exist in your spreadsheet`);
            }
            if (sheetsError.message.includes('permission')) {
                console.error(`Make sure your service account email has edit access to the spreadsheet`);
            }
            return false;
        }
    } catch (error) {
        console.error('Error exporting leaderboards:', error);
        return false;
    }
}

/**
 * Get leaderboard data for users
 * @param {boolean} weekly - Get weekly data instead of total
 */
async function getLeaderboardData(weekly = false) {
    const users = await User.find().sort({ [weekly ? 'weeklyCash' : 'cash']: -1 });

    // Enrich with gang data
    const result = [];

    for (const user of users) {
        const gang = await Gang.findOne({ roleId: user.gangId });
        const gangName = gang ? gang.name : 'Unknown';

        result.push({
            userId: user.userId,
            username: user.username,
            gangName,
            cash: weekly ? user.weeklyCash : user.cash,
            pointsBySource: user.pointsBySource
        });
    }

    return result;
}

/**
 * Get leaderboard data for gangs
 * @param {boolean} weekly - Get weekly data instead of total
 */
async function getGangLeaderboardData(weekly = false) {
    const gangs = await Gang.find().sort({ [weekly ? 'weeklyTotalCash' : 'totalCash']: -1 });

    // Enrich with member counts
    const result = [];

    for (const gang of gangs) {
        const memberCount = await User.countDocuments({ gangId: gang.roleId });

        result.push({
            name: gang.name,
            totalCash: weekly ? gang.weeklyTotalCash : gang.totalCash,
            trophies: gang.trophies,
            memberCount
        });
    }

    return result;
}

module.exports = {
    exportLeaderboards
}; 