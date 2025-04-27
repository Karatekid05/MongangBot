require('dotenv').config();
const mongoose = require('mongoose');
const userSchema = new mongoose.Schema({}, { strict: false });
const User = mongoose.model('User', userSchema);

async function main() {
    try {
        // Conectar ao MongoDB
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Conectado ao MongoDB');

        // Buscar usuários com pointsBySource.nftRewards alto
        const users = await User.find({
            "pointsBySource.nftRewards": { $gt: 10000 }
        }).sort({ "pointsBySource.nftRewards": -1 }).limit(10);

        console.log(`Encontrados ${users.length} usuários com altos valores de NFT Rewards`);

        // Exibir detalhes dos usuários
        for (const user of users) {
            console.log('\n===================================');
            console.log('Usuário:', user.username);
            console.log('ID:', user.userId);
            console.log('Cash total:', user.cash);
            console.log('Cash semanal:', user.weeklyCash);
            console.log('NFTs:', JSON.stringify(user.nfts));
            console.log('Points by Source:', JSON.stringify(user.pointsBySource));
            console.log('Weekly Points by Source:', JSON.stringify(user.weeklyPointsBySource));
        }

        // Verificar também o usuário específico
        const specificUser = await User.findOne({ userId: '741839030194532' });
        if (specificUser) {
            console.log('\n===================================');
            console.log('Usuário específico encontrado:');
            console.log('Username:', specificUser.username);
            console.log('ID:', specificUser.userId);
            console.log('Cash total:', specificUser.cash);
            console.log('Cash semanal:', specificUser.weeklyCash);
            console.log('NFTs:', JSON.stringify(specificUser.nfts));
            console.log('Points by Source:', JSON.stringify(specificUser.pointsBySource));
        } else {
            console.log('\nUsuário específico não encontrado');
        }

        // Mostrar também o usuário com maior cash total
        const topUsers = await User.find().sort({ cash: -1 }).limit(5);
        console.log('\n=== Top 5 Usuários por Cash Total ===');
        for (const user of topUsers) {
            console.log(`${user.username}: ${user.cash} (NFT Rewards: ${user.pointsBySource?.nftRewards || 0})`);
        }
    } catch (error) {
        console.error('Erro:', error);
    } finally {
        // Desconectar do MongoDB
        await mongoose.disconnect();
        console.log('\nDesconectado do MongoDB');
    }
}

main(); 