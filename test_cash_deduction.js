require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./src/models/User');
const { removeCash, awardCash } = require('./src/utils/pointsManager');

async function testCashDeduction() {
    try {
        // Conectar ao MongoDB
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('✅ Conectado ao MongoDB');

        // Buscar um usuário de teste (substitua pelo ID de um usuário real)
        const testUserId = '123456789'; // Substitua por um ID real para teste
        let user = await User.findOne({ userId: testUserId });

        if (!user) {
            console.log('❌ Usuário de teste não encontrado. Criando um...');
            user = new User({
                userId: testUserId,
                username: 'TestUser',
                gangId: '123456789', // Substitua por um roleId real
                cash: 1000,
                weeklyCash: 500,
                pointsBySource: {
                    games: 300,
                    memesAndArt: 200,
                    chatActivity: 300,
                    others: 200
                },
                weeklyPointsBySource: {
                    games: 150,
                    memesAndArt: 100,
                    chatActivity: 150,
                    others: 100
                }
            });
            await user.save();
            console.log('✅ Usuário de teste criado');
        }

        console.log('\n📊 Estado inicial do usuário:');
        console.log(`💰 Total $CASH: ${user.cash}`);
        console.log(`📅 Weekly $CASH: ${user.weeklyCash}`);
        console.log('📈 Points by source:', user.pointsBySource);
        console.log('📅 Weekly points by source:', user.weeklyPointsBySource);

        // Teste 1: Deduzir $CASH de uma fonte específica
        console.log('\n🧪 Teste 1: Deduzindo 100 $CASH da fonte "games"');
        const result1 = await removeCash(testUserId, 100, 'games');
        console.log('Resultado:', result1);

        // Buscar usuário atualizado
        user = await User.findOne({ userId: testUserId });
        console.log('\n📊 Estado após dedução específica:');
        console.log(`💰 Total $CASH: ${user.cash}`);
        console.log(`📅 Weekly $CASH: ${user.weeklyCash}`);
        console.log('📈 Points by source:', user.pointsBySource);
        console.log('📅 Weekly points by source:', user.weeklyPointsBySource);

        // Teste 2: Deduzir $CASH proporcionalmente
        console.log('\n🧪 Teste 2: Deduzindo 150 $CASH proporcionalmente');
        const result2 = await removeCash(testUserId, 150, 'proportional');
        console.log('Resultado:', result2);

        // Buscar usuário atualizado
        user = await User.findOne({ userId: testUserId });
        console.log('\n📊 Estado após dedução proporcional:');
        console.log(`💰 Total $CASH: ${user.cash}`);
        console.log(`📅 Weekly $CASH: ${user.weeklyCash}`);
        console.log('📈 Points by source:', user.pointsBySource);
        console.log('📅 Weekly points by source:', user.weeklyPointsBySource);

        // Teste 3: Simular compra de ticket
        console.log('\n🧪 Teste 3: Simulando compra de ticket (200 $CASH)');
        const result3 = await removeCash(testUserId, 200, 'ticket_purchase');
        console.log('Resultado:', result3);

        // Buscar usuário atualizado
        user = await User.findOne({ userId: testUserId });
        console.log('\n📊 Estado após compra de ticket:');
        console.log(`💰 Total $CASH: ${user.cash}`);
        console.log(`📅 Weekly $CASH: ${user.weeklyCash}`);
        console.log('📈 Points by source:', user.pointsBySource);
        console.log('📅 Weekly points by source:', user.weeklyPointsBySource);

        console.log('\n✅ Testes concluídos!');
        console.log('📋 Verificações:');
        console.log('• O $CASH total deve ter sido deduzido');
        console.log('• O $CASH semanal deve permanecer inalterado');
        console.log('• Os pontos por fonte devem ter sido ajustados corretamente');

    } catch (error) {
        console.error('❌ Erro durante os testes:', error);
    } finally {
        await mongoose.disconnect();
        console.log('📡 Desconectado do MongoDB');
        process.exit(0);
    }
}

// Executar testes
testCashDeduction(); 