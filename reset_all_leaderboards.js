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

        // Buscar estatísticas antes do reset
        const userCount = await User.countDocuments();
        const gangCount = await Gang.countDocuments();
        const topUsers = await User.find().sort({ cash: -1 }).limit(5);

        console.log(`Total de usuários: ${userCount}`);
        console.log(`Total de gangs: ${gangCount}`);

        console.log('\n=== Top 5 Usuários Antes do Reset ===');
        for (const user of topUsers) {
            console.log(`${user.username}: ${user.cash} (Semanal: ${user.weeklyCash})`);
        }

        // Confirmar operação
        if (process.argv[2] !== '--confirm') {
            console.log('\n⚠️ ATENÇÃO: Esta operação irá zerar todos os pontos de todos os usuários.');
            console.log('Para confirmar, execute o script com a flag --confirm');
            return;
        }

        console.log('\n🔄 Iniciando reset completo dos leaderboards...');

        // Resetar todos os usuários
        const userResult = await User.updateMany(
            {},
            {
                $set: {
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
                    'weeklyPointsBySource.nftRewards': 0
                }
            }
        );

        // Resetar todas as gangs
        const gangResult = await Gang.updateMany(
            {},
            {
                $set: {
                    totalCash: 0,
                    weeklyTotalCash: 0
                }
            }
        );

        console.log(`\n✅ Reset concluído!`);
        console.log(`Usuários resetados: ${userResult.modifiedCount}`);
        console.log(`Gangs resetadas: ${gangResult.modifiedCount}`);

        // Verificar após o reset
        const checkUsers = await User.find().sort({ cash: -1 }).limit(5);
        console.log('\n=== Verificação após o reset ===');

        if (checkUsers.length === 0) {
            console.log('Nenhum usuário encontrado');
        } else {
            for (const user of checkUsers) {
                console.log(`${user.username}: ${user.cash} (Semanal: ${user.weeklyCash})`);
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

console.log('🚨 RESET COMPLETO DO LEADERBOARD 🚨');
console.log('Esta operação irá zerar TODOS os pontos de TODOS os usuários, tanto semanais quanto totais.');
console.log('As recompensas diárias de NFT continuarão funcionando normalmente após o reset.');

if (process.argv[2] === '--confirm') {
    console.log('\n✓ Confirmação recebida. Iniciando o reset...');
    main();
} else {
    console.log('\n❌ Operação cancelada. Para executar, use:');
    console.log('node reset_all_leaderboards.js --confirm');
} 