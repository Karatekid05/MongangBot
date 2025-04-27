require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./src/models/User');
const Gang = require('./src/models/Gang');
const { exportLeaderboards } = require('./src/utils/googleSheets');

async function test() {
    try {
        // Conectar ao MongoDB
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('✅ Conectado ao MongoDB');

        // Obter informações sobre um usuário para verificar
        const user = await User.findOne({ username: 'karatekid05' });

        if (user) {
            console.log('Informações do usuário karatekid05:');
            console.log(`- Cash total: ${user.cash}`);
            console.log(`- Cash semanal: ${user.weeklyCash}`);
            console.log('\nFontes de pontos totais:');
            console.log(`- Games: ${user.pointsBySource.games}`);
            console.log(`- Memes & Art: ${user.pointsBySource.memesAndArt}`);
            console.log(`- Chat: ${user.pointsBySource.chatActivity}`);
            console.log(`- Others: ${user.pointsBySource.others}`);
            console.log(`- NFT Rewards: ${user.pointsBySource.nftRewards}`);

            console.log('\nFontes de pontos semanais:');
            console.log(`- Games: ${user.weeklyPointsBySource.games}`);
            console.log(`- Memes & Art: ${user.weeklyPointsBySource.memesAndArt}`);
            console.log(`- Chat: ${user.weeklyPointsBySource.chatActivity}`);
            console.log(`- Others: ${user.weeklyPointsBySource.others}`);
            console.log(`- NFT Rewards: ${user.weeklyPointsBySource.nftRewards}`);
        } else {
            console.log('❌ Usuário karatekid05 não encontrado');
        }

        // Exportar leaderboard semanal
        console.log('\n🔄 Exportando leaderboard semanal...');
        const success = await exportLeaderboards(true);

        if (success) {
            console.log('✅ Leaderboard semanal exportado com sucesso');
        } else {
            console.log('❌ Falha ao exportar leaderboard semanal');
        }

    } catch (error) {
        console.error('❌ Erro:', error);
    } finally {
        await mongoose.disconnect();
        console.log('📡 Desconectado do MongoDB');
    }
}

test(); 