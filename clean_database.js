require('dotenv').config();
const mongoose = require('mongoose');
const userSchema = new mongoose.Schema({}, { strict: false });
const User = mongoose.model('User', userSchema);
const gangSchema = new mongoose.Schema({}, { strict: false });
const Gang = mongoose.model('Gang', gangSchema);

async function main() {
    try {
        // Conectar ao MongoDB
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Conectado ao MongoDB');

        // Buscar estatísticas antes da limpeza
        const userCount = await User.countDocuments();
        const gangCount = await Gang.countDocuments();
        const walletCount = await User.countDocuments({ walletAddress: { $exists: true, $ne: "" } });

        console.log(`Total de usuários: ${userCount}`);
        console.log(`Total de gangs: ${gangCount}`);
        console.log(`Usuários com carteiras: ${walletCount}`);

        // Confirmar operação
        if (process.argv[2] !== '--confirm') {
            console.log('\n⚠️ ATENÇÃO: Esta operação irá zerar TODOS os dados, incluindo carteiras registradas!');
            console.log('Para confirmar, execute o script com a flag --confirm');
            return;
        }

        console.log('\n🔄 Iniciando limpeza completa do banco de dados...');

        // Resetar todos os usuários e remover carteiras
        const userResult = await User.updateMany(
            {},
            {
                $set: {
                    // Zerar pontos
                    cash: 0,
                    weeklyCash: 0,
                    'pointsBySource.games': 0,
                    'pointsBySource.memesAndArt': 0,
                    'pointsBySource.chatActivity': 0,
                    'pointsBySource.others': 0,
                    'pointsBySource.nftRewards': 0,
                    'weeklyPointsBySource.games': 0,
                    'weeklyPointsBySource.memesAndArt': 0,
                    'weeklyPointsBySource.chatActivity': 0,
                    'weeklyPointsBySource.others': 0,
                    'weeklyPointsBySource.nftRewards': 0,

                    // Limpar dados de carteira
                    walletAddress: "",
                    walletVerified: false,
                    verificationTxHash: null,
                    verificationPending: false,
                    verificationAmount: 0,
                    verificationTimestamp: null,

                    // Resetar NFTs
                    'nfts.collection1Count': 0,
                    'nfts.collection2Count': 0,

                    // Limpar histórico
                    lastMessageReward: new Date(0)
                },
                $unset: {
                    gangContributions: ""
                }
            }
        );

        // Resetar todas as gangs
        const gangResult = await Gang.updateMany(
            {},
            {
                $set: {
                    totalCash: 0,
                    weeklyTotalCash: 0,
                    trophies: 0
                }
            }
        );

        console.log(`\n✅ Limpeza concluída!`);
        console.log(`Usuários limpos: ${userResult.modifiedCount}`);
        console.log(`Gangs limpas: ${gangResult.modifiedCount}`);

        // Verificar após a limpeza
        const checkUsers = await User.find({ walletAddress: { $ne: "" } }).limit(5);
        console.log('\n=== Verificação após a limpeza ===');

        if (checkUsers.length === 0) {
            console.log('✓ Nenhum usuário com carteira encontrado');
        } else {
            console.log('⚠️ Alguns usuários ainda têm carteiras:');
            for (const user of checkUsers) {
                console.log(`${user.username}: ${user.walletAddress}`);
            }
        }

        const checkPoints = await User.find({ cash: { $gt: 0 } }).limit(5);
        if (checkPoints.length === 0) {
            console.log('✓ Nenhum usuário com pontos encontrado');
        } else {
            console.log('⚠️ Alguns usuários ainda têm pontos:');
            for (const user of checkPoints) {
                console.log(`${user.username}: ${user.cash}`);
            }
        }

    } catch (error) {
        console.error('Erro:', error);
    } finally {
        // Desconectar do MongoDB
        await mongoose.disconnect();
        console.log('\nDesconectado do MongoDB');
    }
}

console.log('🚨 LIMPEZA COMPLETA DO BANCO DE DADOS 🚨');
console.log('Esta operação irá:');
console.log('1. Zerar TODOS os pontos de TODOS os usuários');
console.log('2. Remover TODAS as carteiras registradas');
console.log('3. Zerar todas as contagens de NFTs');
console.log('4. Resetar todas as gangs e troféus');

if (process.argv[2] === '--confirm') {
    console.log('\n✓ Confirmação recebida. Iniciando a limpeza...');
    main();
} else {
    console.log('\n❌ Operação cancelada. Para executar, use:');
    console.log('node clean_database.js --confirm');
} 