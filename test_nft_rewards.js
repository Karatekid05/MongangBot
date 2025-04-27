require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./src/models/User');
const { NFT_COLLECTION1_DAILY_REWARD, NFT_COLLECTION2_DAILY_REWARD } = require('./src/utils/constants');

async function testNftRewards() {
    try {
        // Conectar ao MongoDB
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('✅ Conectado ao MongoDB');

        // Usuário para verificar
        const username = 'karatekid05';

        // Buscar o usuário
        const user = await User.findOne({ username });

        if (!user) {
            console.log(`❌ Usuário ${username} não encontrado`);
            return;
        }

        console.log(`===== Informações de NFT para ${username} =====`);
        console.log(`ID do usuário: ${user.userId}`);
        console.log(`Carteira: ${user.walletAddress || 'Não registrada'}`);
        console.log(`Verificada: ${user.walletVerified ? 'Sim' : 'Não'}`);

        console.log('\n===== Detalhes de NFTs =====');
        console.log(`Collection 1: ${user.nfts?.collection1Count || 0} NFTs`);
        console.log(`Collection 2: ${user.nfts?.collection2Count || 0} NFTs`);

        // Calcular recompensa total
        const collection1Reward = user.nfts?.collection1Count > 0 ? NFT_COLLECTION1_DAILY_REWARD : 0;
        const collection2Reward = user.nfts?.collection2Count > 0 ? NFT_COLLECTION2_DAILY_REWARD : 0;
        const totalReward = collection1Reward + collection2Reward;

        console.log('\n===== Recompensas Estimadas =====');
        console.log(`Collection 1: ${collection1Reward} $CASH/dia`);
        console.log(`Collection 2: ${collection2Reward} $CASH/dia`);
        console.log(`Total: ${totalReward} $CASH/dia`);

        console.log('\n===== Informações de Pontos =====');
        console.log(`Cash Total: ${user.cash}`);
        console.log(`Cash Semanal: ${user.weeklyCash}`);
        console.log(`Última recompensa NFT: ${user.lastNftReward ? new Date(user.lastNftReward).toLocaleString() : 'Nunca'}`);

        console.log('\n===== Fonte de Pontos =====');
        console.log('Total:');
        console.log(`- Games: ${user.pointsBySource?.games || 0}`);
        console.log(`- Memes & Art: ${user.pointsBySource?.memesAndArt || 0}`);
        console.log(`- Chat: ${user.pointsBySource?.chatActivity || 0}`);
        console.log(`- Outros: ${user.pointsBySource?.others || 0}`);
        console.log(`- Recompensas NFT: ${user.pointsBySource?.nftRewards || 0}`);

        console.log('\nSemanal:');
        console.log(`- Games: ${user.weeklyPointsBySource?.games || 0}`);
        console.log(`- Memes & Art: ${user.weeklyPointsBySource?.memesAndArt || 0}`);
        console.log(`- Chat: ${user.weeklyPointsBySource?.chatActivity || 0}`);
        console.log(`- Outros: ${user.weeklyPointsBySource?.others || 0}`);
        console.log(`- Recompensas NFT: ${user.weeklyPointsBySource?.nftRewards || 0}`);

    } catch (error) {
        console.error('❌ Erro:', error);
    } finally {
        await mongoose.disconnect();
        console.log('\n📡 Desconectado do MongoDB');
    }
}

console.log('🔍 Verificando informações de recompensas NFT...');
testNftRewards(); 