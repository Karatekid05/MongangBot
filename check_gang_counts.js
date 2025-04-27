require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./src/models/User');
const Gang = require('./src/models/Gang');

async function main() {
    try {
        // Conectar ao MongoDB
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Conectado ao MongoDB');

        // Buscar todas as gangs
        const gangs = await Gang.find();
        console.log(`Total de gangs: ${gangs.length}`);

        // Mapear gangs por ID de cargo
        const gangMap = {};
        gangs.forEach(gang => {
            gangMap[gang.roleId] = gang.name;
        });

        // Contar usuários por gang
        for (const gang of gangs) {
            const count = await User.countDocuments({ gangId: gang.roleId });
            console.log(`Gang ${gang.name}: ${count} membros`);

            // Listar membros da gang Sea Kings se for a primeira gang (para verificar)
            if (gang.name === 'Sea Kings') {
                console.log('\nMembros dos Sea Kings:');
                const members = await User.find({ gangId: gang.roleId }).sort({ username: 1 });
                members.forEach(member => {
                    console.log(`- ${member.username} (${member.userId})`);
                });
            }
        }

    } catch (error) {
        console.error('Erro:', error);
    } finally {
        await mongoose.disconnect();
        console.log('Desconectado do MongoDB');
    }
}

main(); 