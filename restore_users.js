require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./src/models/User');
const fs = require('fs');

async function restoreUsers(backupFileName) {
    console.log(`🔄 Restaurando usuários do backup: ${backupFileName}`);

    try {
        // Verificar se o arquivo de backup existe
        if (!fs.existsSync(backupFileName)) {
            console.error(`❌ Arquivo de backup não encontrado: ${backupFileName}`);
            return;
        }

        // Conectar ao MongoDB
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('✅ Conectado ao MongoDB');

        // Ler backup
        const backupData = JSON.parse(fs.readFileSync(backupFileName, 'utf8'));
        console.log(`📊 Backup contém ${backupData.users.length} usuários`);

        // Confirmar restauração
        console.log('⚠️  ATENÇÃO: Isso vai sobrescrever todos os usuários atuais!');
        console.log('   Para continuar, edite este arquivo e descomente a linha de restauração');

        // DESCOMENTE A LINHA ABAIXO PARA EXECUTAR A RESTAURAÇÃO:
        // await performRestore(backupData.users);

    } catch (error) {
        console.error('❌ Erro durante a restauração:', error);
    } finally {
        await mongoose.disconnect();
        console.log('📡 Desconectado do MongoDB');
    }
}

async function performRestore(users) {
    console.log('🗑️  Removendo todos os usuários atuais...');
    await User.deleteMany({});

    console.log('➕ Restaurando usuários do backup...');
    let restoredCount = 0;

    for (const userData of users) {
        try {
            // Converter gangContributions de volta para Map
            if (userData.gangContributions && typeof userData.gangContributions === 'object') {
                userData.gangContributions = new Map(Object.entries(userData.gangContributions));
            }

            const user = new User(userData);
            await user.save();
            restoredCount++;

            if (restoredCount % 10 === 0) {
                console.log(`   Restaurados ${restoredCount}/${users.length} usuários...`);
            }
        } catch (error) {
            console.error(`❌ Erro ao restaurar usuário ${userData.username}:`, error);
        }
    }

    console.log(`✅ Restauração concluída: ${restoredCount} usuários restaurados`);
}

// Verificar argumentos da linha de comando
const backupFile = process.argv[2];
if (!backupFile) {
    console.log('❌ Uso: node restore_users.js <arquivo_backup.json>');
    console.log('   Exemplo: node restore_users.js backup_users_2024-01-15T10-30-00-000Z.json');
    process.exit(1);
}

restoreUsers(backupFile); 