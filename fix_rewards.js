require('dotenv').config();
const mongoose = require('mongoose');
const userSchema = new mongoose.Schema({}, { strict: false });
const User = mongoose.model('User', userSchema);

async function main() {
    try {
        // Conectar ao MongoDB
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Conectado ao MongoDB');

        // ID do usuário com problema
        const userId = '741839030194536554';

        // Buscar o usuário
        const user = await User.findOne({ userId });

        if (!user) {
            console.log('Usuário não encontrado');
            return;
        }

        console.log('=== Antes da correção ===');
        console.log(`Usuário: ${user.username}`);
        console.log(`Cash total: ${user.cash}`);
        console.log(`Pontos NFT: ${user.pointsBySource.nftRewards}`);

        // Calcular o máximo razoável de NFT Rewards (assumindo 600 por dia por 30 dias = 18.000)
        const maxReasonableNftRewards = 18000;
        const cashReduction = user.pointsBySource.nftRewards - maxReasonableNftRewards;

        if (cashReduction <= 0) {
            console.log('Os pontos de NFT estão dentro de um limite razoável. Nenhuma correção necessária.');
            return;
        }

        // Atualizar o usuário
        const newTotalCash = user.cash - cashReduction;
        await User.updateOne(
            { userId },
            {
                $set: {
                    cash: newTotalCash,
                    'pointsBySource.nftRewards': maxReasonableNftRewards
                }
            }
        );

        // Verificar a correção
        const updatedUser = await User.findOne({ userId });
        console.log('\n=== Após a correção ===');
        console.log(`Usuário: ${updatedUser.username}`);
        console.log(`Cash total: ${updatedUser.cash}`);
        console.log(`Pontos NFT: ${updatedUser.pointsBySource.nftRewards}`);
        console.log(`\nRedução aplicada: ${cashReduction} pontos`);

        // Procurar outros usuários com problemas semelhantes
        const otherUsers = await User.find({
            "pointsBySource.nftRewards": { $gt: maxReasonableNftRewards }
        }).limit(10);

        if (otherUsers.length > 0) {
            console.log('\n=== Outros usuários com altos valores de NFT Rewards ===');
            for (const u of otherUsers) {
                console.log(`${u.username}: ${u.pointsBySource.nftRewards} pontos`);
            }
        } else {
            console.log('\nNenhum outro usuário com valores excessivos de NFT Rewards.');
        }

    } catch (error) {
        console.error('Erro:', error);
    } finally {
        // Desconectar do MongoDB
        await mongoose.disconnect();
        console.log('\nDesconectado do MongoDB');
    }
}

// Perguntar ao usuário se deseja prosseguir
console.log('ATENÇÃO: Este script reduzirá os pontos NFT e o cash total de um usuário.');
console.log('Você tem certeza que deseja continuar? (sim/não)');

// Simular resposta automática para demonstração (em produção, você leria a entrada do usuário)
const autoConfirm = process.argv[2] === '--confirm';
if (autoConfirm) {
    console.log('Resposta: sim');
    main();
} else {
    console.log('\nOperação cancelada. Para executar, use:');
    console.log('node fix_rewards.js --confirm');
} 