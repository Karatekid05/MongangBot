require('dotenv').config();
const mongoose = require('mongoose');
const { distributeDailyRoleRewards } = require('./src/utils/dailyRoleRewards');

// Mock client para teste
const mockClient = {
    guilds: {
        cache: new Map([
            ['123456789', {
                name: 'Test Guild',
                members: {
                    fetch: async () => { },
                    cache: new Map([
                        ['user1', {
                            user: { username: 'TestUser1', bot: false },
                            roles: {
                                cache: {
                                    has: (roleId) => roleId === '1385211569872310324'
                                }
                            }
                        }],
                        ['user2', {
                            user: { username: 'TestUser2', bot: false },
                            roles: {
                                cache: {
                                    has: (roleId) => roleId === '1385211569872310324'
                                }
                            }
                        }],
                        ['user3', {
                            user: { username: 'TestUser3', bot: false },
                            roles: {
                                cache: {
                                    has: (roleId) => false // Não tem o role
                                }
                            }
                        }],
                        ['bot1', {
                            user: { username: 'BotUser', bot: true },
                            roles: {
                                cache: {
                                    has: (roleId) => roleId === '1385211569872310324'
                                }
                            }
                        }]
                    ])
                }
            }]
        ])
    }
};

async function testDailyRoleRewards() {
    try {
        console.log('🧪 Testing daily role rewards distribution...');

        // Connect to MongoDB
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('✅ Connected to MongoDB');

        // Test distribution
        await distributeDailyRoleRewards(
            mockClient,
            '1385211569872310324', // Role ID
            500, // Amount
            'others' // Source
        );

        console.log('✅ Test completed successfully!');

    } catch (error) {
        console.error('❌ Test failed:', error);
    } finally {
        await mongoose.disconnect();
        console.log('📦 Disconnected from MongoDB');
    }
}

// Run test
testDailyRoleRewards(); 