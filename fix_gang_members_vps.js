require('dotenv').config();
const { Client, GatewayIntentBits } = require('discord.js');
const mongoose = require('mongoose');
const User = require('./src/models/User');
const Gang = require('./src/models/Gang');
const fs = require('fs');

// Configuração do cliente Discord
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers
    ]
});

async function backupAndFixGangMembers() {
    console.log('🔧 Iniciando backup e correção de membros das gangs...');

    try {
        // Conectar ao MongoDB
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('✅ Conectado ao MongoDB');

        // 1. PRIMEIRO: Fazer backup
        console.log('💾 Criando backup dos usuários...');
        const users = await User.find();
        console.log(`📊 Total de usuários encontrados: ${users.length}`);

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const backupData = {
            timestamp: new Date().toISOString(),
            totalUsers: users.length,
            users: users.map(user => ({
                _id: user._id,
                userId: user.userId,
                username: user.username,
                gangId: user.gangId,
                previousGangId: user.previousGangId,
                cash: user.cash,
                weeklyCash: user.weeklyCash,
                gangContributions: user.gangContributions ? Object.fromEntries(user.gangContributions) : {},
                walletAddress: user.walletAddress,
                walletVerified: user.walletVerified,
                nfts: user.nfts,
                pointsBySource: user.pointsBySource,
                weeklyPointsBySource: user.weeklyPointsBySource,
                createdAt: user.createdAt,
                updatedAt: user.updatedAt
            }))
        };

        const backupFileName = `backup_users_${timestamp}.json`;
        fs.writeFileSync(backupFileName, JSON.stringify(backupData, null, 2));
        console.log(`✅ Backup criado: ${backupFileName}`);

        // Mostrar resumo por gang antes da correção
        const gangCountsBefore = {};
        users.forEach(user => {
            gangCountsBefore[user.gangId] = (gangCountsBefore[user.gangId] || 0) + 1;
        });

        console.log('📊 Usuários por gang ANTES da correção:');
        Object.entries(gangCountsBefore).forEach(([gangId, count]) => {
            console.log(`   ${gangId}: ${count} usuários`);
        });

        // 2. SEGUNDO: Buscar todas as gangs
        const gangs = await Gang.find();
        console.log(`📊 Total de gangs encontradas: ${gangs.length}`);

        // Aguardar o client estar pronto
        if (!client.isReady()) {
            await new Promise(resolve => client.once('ready', resolve));
        }
        console.log('✅ Bot conectado ao Discord');

        // Obter o servidor principal
        const guildId = process.env.GUILD_ID || process.env.DISCORD_GUILD_ID;
        if (!guildId) {
            throw new Error('GUILD_ID ou DISCORD_GUILD_ID não encontrado no arquivo .env');
        }

        const guild = client.guilds.cache.get(guildId);
        if (!guild) {
            throw new Error(`Servidor com ID ${guildId} não encontrado`);
        }

        // Aguardar carregamento dos membros do servidor
        await guild.members.fetch();
        console.log(`📊 Total de membros no servidor: ${guild.members.cache.size}`);

        // Mapear todos os IDs de cargos de gang
        const gangRoleIds = gangs.map(gang => gang.roleId);
        const gangMap = {};
        gangs.forEach(gang => {
            gangMap[gang.roleId] = gang;
        });

        // 3. TERCEIRO: Corrigir usuários
        console.log('\n🔧 Iniciando correção de usuários...');
        let correctedUsers = 0;
        let removedUsers = 0;

        // Verificar cada usuário
        for (const user of users) {
            console.log(`🔍 Verificando usuário: ${user.username} (${user.userId}) - Gang atual: ${user.gangId}`);

            // Verificar se o usuário ainda está no servidor
            const discordMember = await guild.members.fetch(user.userId).catch(() => null);

            if (!discordMember) {
                // Usuário não está mais no servidor - remover do banco
                console.log(`🗑️ Usuário ${user.username} não está mais no servidor - removendo do banco`);
                await User.deleteOne({ _id: user._id });
                removedUsers++;
                continue;
            }

            // Verificar qual gang o usuário realmente pertence no Discord
            let actualGangId = null;
            for (const roleId of gangRoleIds) {
                if (discordMember.roles.cache.has(roleId)) {
                    actualGangId = roleId;
                    break;
                }
            }

            if (!actualGangId) {
                // Usuário não pertence a nenhuma gang - remover do banco
                console.log(`🗑️ Usuário ${user.username} não pertence a nenhuma gang - removendo do banco`);
                await User.deleteOne({ _id: user._id });
                removedUsers++;
                continue;
            }

            // Se a gang no banco não corresponde à gang real no Discord
            if (user.gangId !== actualGangId) {
                console.log(`🔄 Corrigindo gang do usuário ${user.username}: ${user.gangId} -> ${actualGangId}`);

                // Salvar contribuição atual para a gang antiga
                if (!user.gangContributions) {
                    user.gangContributions = new Map();
                }

                // Armazenar a contribuição atual na gang anterior
                const currentContribution = user.gangContributions.get(user.gangId) || 0;
                user.gangContributions.set(user.gangId, currentContribution + user.cash);

                console.log(`💾 Armazenando ${user.cash} $CASH como contribuição para gang anterior ${user.gangId}`);

                // Atualizar a gang nos dados do usuário
                user.previousGangId = user.gangId;
                user.gangId = actualGangId;

                // Salvar as alterações
                await user.save();
                correctedUsers++;

                console.log(`✅ Gang corrigida para ${user.username}: ${gangMap[actualGangId]?.name || actualGangId}`);
            } else {
                console.log(`✅ Usuário ${user.username} já está com gang correta`);
            }
        }

        // 4. QUARTO: Mostrar resultados
        console.log('\n✅ Correção concluída!');
        console.log(`📊 Resumo:`);
        console.log(`   - Usuários corrigidos: ${correctedUsers}`);
        console.log(`   - Usuários removidos: ${removedUsers}`);
        console.log(`   - Backup criado: ${backupFileName}`);

        // Contar membros por gang após correção
        console.log('\n📊 Usuários por gang APÓS correção:');
        for (const gang of gangs) {
            const count = await User.countDocuments({ gangId: gang.roleId });
            console.log(`   ${gang.name}: ${count} membros`);
        }

        console.log(`\n💾 Para reverter, use: node restore_users.js ${backupFileName}`);

    } catch (error) {
        console.error('❌ Erro durante a correção:', error);
    } finally {
        // Desconectar do MongoDB e do Discord
        await mongoose.disconnect();
        console.log('📡 Desconectado do MongoDB');
        client.destroy();
        console.log('📡 Desconectado do Discord');
        process.exit(0);
    }
}

// Login no Discord
client.login(process.env.DISCORD_TOKEN)
    .then(() => {
        console.log('✅ Login no Discord realizado com sucesso');
        backupAndFixGangMembers();
    })
    .catch(error => {
        console.error('❌ Erro ao fazer login no Discord:', error);
        process.exit(1);
    }); 