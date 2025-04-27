require('dotenv').config();
const mongoose = require('mongoose');
const { Client, GatewayIntentBits } = require('discord.js');
const { dailyNftRewards } = require('./src/utils/nftRewards');

async function testNftRewards() {
    // Criar cliente do Discord com intents necessários
    const client = new Client({
        intents: [
            GatewayIntentBits.Guilds,
            GatewayIntentBits.GuildMembers
        ]
    });

    try {
        // Conectar ao MongoDB
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('✅ Conectado ao MongoDB');

        // Login do cliente Discord
        await client.login(process.env.DISCORD_TOKEN);
        console.log('✅ Conectado ao Discord');

        // Aguardar o cliente estar pronto
        if (!client.isReady()) {
            await new Promise(resolve => client.once('ready', resolve));
        }

        console.log('▶️ Executando distribuição de recompensas NFT...');
        await dailyNftRewards(client);
        console.log('✅ Distribuição de recompensas NFT concluída!');

        // Verificar os totais das gangs
        const Gang = require('./src/models/Gang');
        const User = require('./src/models/User');

        const gangs = await Gang.find();
        console.log('\n===== Totais das Gangs Após Recompensas =====');

        for (const gang of gangs) {
            const totalNftRewards = await User.aggregate([
                { $match: { gangId: gang.roleId } },
                { $group: { _id: null, total: { $sum: '$pointsBySource.nftRewards' } } }
            ]);

            const weeklyNftRewards = await User.aggregate([
                { $match: { gangId: gang.roleId } },
                { $group: { _id: null, total: { $sum: '$weeklyPointsBySource.nftRewards' } } }
            ]);

            const nftRewardsTotal = totalNftRewards.length > 0 ? totalNftRewards[0].total : 0;
            const nftRewardsWeekly = weeklyNftRewards.length > 0 ? weeklyNftRewards[0].total : 0;

            console.log(`Gang: ${gang.name}`);
            console.log(`  Total Cash: ${gang.totalCash}`);
            console.log(`  Total Semanal: ${gang.weeklyTotalCash}`);
            console.log(`  Total de Recompensas NFT: ${nftRewardsTotal}`);
            console.log(`  Recompensas NFT Semanais: ${nftRewardsWeekly}`);
            console.log('-------------------------------------------');
        }

    } catch (error) {
        console.error('❌ Erro:', error);
    } finally {
        // Desconectar do MongoDB e Discord
        await mongoose.disconnect();
        console.log('📡 Desconectado do MongoDB');
        client.destroy();
        console.log('📡 Desconectado do Discord');
    }
}

console.log('🚀 Iniciando teste de recompensas NFT...');
testNftRewards(); 