const Gang = require('../models/Gang');
const { GANGS } = require('./constants');

/**
 * Initialize gangs in the database
 */
async function initializeGangs() {
    try {
        console.log('Initializing gangs...');

        // Create gangs if they don't exist
        for (const gangData of GANGS) {
            const existingGang = await Gang.findOne({ roleId: gangData.roleId });

            if (!existingGang) {
                const newGang = new Gang({
                    name: gangData.name,
                    roleId: gangData.roleId,
                    channelId: gangData.channelId,
                    trophies: 0,
                    totalCash: 0,
                    weeklyTotalCash: 0
                });

                await newGang.save();
                console.log(`Created gang: ${gangData.name}`);
            } else {
                console.log(`Gang already exists: ${gangData.name}`);
            }
        }

        console.log('Gang initialization complete');
        return true;
    } catch (error) {
        console.error('Error initializing gangs:', error);
        return false;
    }
}

module.exports = { initializeGangs }; 