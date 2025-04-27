require('dotenv').config();
const { Client, GatewayIntentBits } = require('discord.js');
const mongoose = require('mongoose');
const User = require('./src/models/User');
const Gang = require('./src/models/Gang');

// Configuração do cliente Discord
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers
    ]
});

// Exibir valor das variáveis para debug
console.log(`GUILD_ID do arquivo .env: ${process.env.GUILD_ID}`);
console.log(`DISCORD_GUILD_ID do arquivo .env: ${process.env.DISCORD_GUILD_ID}`);

async function syncGangMembers() {
    console.log('🔄 Iniciando sincronização de membros das gangs...');

    try {
        // Conectar ao MongoDB
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('✅ Conectado ao MongoDB');

        // Buscar todas as gangs
        const gangs = await Gang.find();
        console.log(`📊 Total de gangs encontradas: ${gangs.length}`);

        // Aguardar o client estar pronto
        if (!client.isReady()) {
            await new Promise(resolve => client.once('ready', resolve));
        }
        console.log('✅ Bot conectado ao Discord');

        // Obter o servidor principal - verificar ambas as variáveis
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

        // Mapear todos os IDs de cargos de gang para verificação
        const gangRoleIds = gangs.map(gang => gang.roleId);

        // Mapear gangs por ID
        const gangMap = {};
        gangs.forEach(gang => {
            gangMap[gang.roleId] = gang;
        });

        // Sincronizar cada gang
        for (const gang of gangs) {
            // Obter membros com o cargo da gang no Discord
            const role = guild.roles.cache.get(gang.roleId);
            if (!role) {
                console.error(`❌ Cargo não encontrado para gang ${gang.name} (ID: ${gang.roleId})`);
                continue;
            }

            const discordMembers = role.members;
            console.log(`📊 Gang ${gang.name}: ${discordMembers.size} membros no Discord`);

            // Obter membros da gang no banco de dados
            const dbMembers = await User.find({ gangId: gang.roleId });
            console.log(`📊 Gang ${gang.name}: ${dbMembers.length} membros no banco de dados`);

            // Mapear membros do Discord por ID
            const discordMemberIds = new Set(discordMembers.map(m => m.id));

            // Mapear membros do banco de dados por ID
            const dbMemberIds = new Set(dbMembers.map(m => m.userId));

            // Usuários que existem no banco mas não estão no Discord com o cargo
            const membersToRemove = dbMembers.filter(m => !discordMemberIds.has(m.userId));

            // Usuários que existem no Discord com o cargo mas não no banco
            const membersToAdd = [...discordMembers.values()].filter(m => !dbMemberIds.has(m.id));

            // Registrar diferenças encontradas
            console.log(`🔍 Gang ${gang.name}: ${membersToAdd.length} membros para adicionar, ${membersToRemove.length} para remover`);

            // Atualizar usuários que não estão mais na gang
            if (membersToRemove.length > 0) {
                for (const member of membersToRemove) {
                    console.log(`🔄 Verificando usuário ${member.username} (${member.userId}) - removendo da gang ${gang.name}`);

                    // Verificar se o membro ainda está no servidor
                    const discordMember = await guild.members.fetch(member.userId).catch(() => null);

                    if (!discordMember) {
                        // Usuário não está mais no servidor - remover do banco de dados
                        console.log(`🗑️ Usuário ${member.username} não está mais no servidor - removendo do banco`);
                        await User.deleteOne({ _id: member._id });
                        continue;
                    }

                    // Verificar se o usuário tem outra gang
                    let foundGang = false;
                    for (const roleId of gangRoleIds) {
                        if (roleId !== gang.roleId && discordMember.roles.cache.has(roleId)) {
                            // Usuário tem outra gang - atualizar gangId
                            console.log(`✅ Usuário ${member.username} pertence à gang ${gangMap[roleId].name}`);
                            member.previousGangId = member.gangId;
                            member.gangId = roleId;
                            await member.save();
                            foundGang = true;
                            break;
                        }
                    }

                    if (!foundGang) {
                        // Usuário não tem nenhuma gang - remover do banco de dados
                        console.log(`🗑️ Usuário ${member.username} não pertence a nenhuma gang - removendo do banco`);
                        await User.deleteOne({ _id: member._id });
                    }
                }
            }

            // Adicionar usuários novos ao banco de dados
            for (const discordMember of membersToAdd) {
                console.log(`🔄 Verificando membro ${discordMember.user.username} (${discordMember.id})`);

                // Verificar se o usuário já existe no banco com outra gang
                let user = await User.findOne({ userId: discordMember.id });

                if (user) {
                    // Atualizar gang do usuário
                    console.log(`🔄 Atualizando gang do usuário ${user.username} para ${gang.name}`);
                    user.previousGangId = user.gangId;
                    user.gangId = gang.roleId;
                    await user.save();
                } else {
                    // Criar novo usuário
                    console.log(`➕ Criando novo usuário para ${discordMember.user.username}`);
                    user = new User({
                        userId: discordMember.id,
                        username: discordMember.user.username,
                        gangId: gang.roleId,
                        cash: 0,
                        weeklyCash: 0
                    });
                    await user.save();
                }
            }
        }

        console.log('✅ Sincronização concluída!');

        // Contar membros atualizados por gang
        for (const gang of gangs) {
            const count = await User.countDocuments({ gangId: gang.roleId });
            console.log(`📊 Gang ${gang.name}: ${count} membros após sincronização`);
        }

    } catch (error) {
        console.error('❌ Erro durante a sincronização:', error);
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
        syncGangMembers();
    })
    .catch(error => {
        console.error('❌ Erro ao fazer login no Discord:', error);
        process.exit(1);
    }); 