require('dotenv').config();
const mongoose = require('mongoose');
const { Client, GatewayIntentBits } = require('discord.js');
const User = require('./src/models/User');
const Gang = require('./src/models/Gang');

// Configuração do cliente Discord
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers
    ]
});

async function main() {
    try {
        // Conectar ao MongoDB
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('✅ Conectado ao MongoDB');

        // Login no Discord
        await client.login(process.env.DISCORD_TOKEN);
        console.log('✅ Login no Discord realizado com sucesso');

        // Aguardar o cliente estar pronto
        if (!client.isReady()) {
            await new Promise(resolve => client.once('ready', resolve));
        }

        // Obter o servidor
        const guildId = process.env.DISCORD_GUILD_ID || process.env.GUILD_ID;
        if (!guildId) {
            throw new Error('ID do servidor não encontrado no arquivo .env');
        }

        const guild = client.guilds.cache.get(guildId);
        if (!guild) {
            throw new Error(`Servidor com ID ${guildId} não encontrado`);
        }

        // Carregar membros do servidor
        await guild.members.fetch();
        console.log(`📊 Total de membros no servidor: ${guild.members.cache.size}`);

        // Buscar todas as gangs
        const gangs = await Gang.find();
        console.log(`📊 Total de gangs: ${gangs.length}`);

        // Mapear gangs por ID de cargo
        const gangMap = {};
        gangs.forEach(gang => {
            gangMap[gang.roleId] = gang.name;
        });

        // Lista dos usuários que precisam ser verificados/corrigidos
        const problematicUsers = [
            // Membros que foram movidos incorretamente
            "yogmonad", "medoed_eded", "emil_pepil", "kseniyalarico10", "xdanz02", "tinashea"
        ];

        console.log('🔄 Verificando e corrigindo usuários problemáticos...');

        for (const username of problematicUsers) {
            // Buscar o usuário no banco de dados
            const user = await User.findOne({ username });

            if (!user) {
                console.log(`❌ Usuário ${username} não encontrado no banco de dados`);
                continue;
            }

            console.log(`🔍 Verificando ${username} (${user.userId})...`);

            // Buscar o membro no Discord
            const member = await guild.members.fetch(user.userId).catch(() => null);

            if (!member) {
                console.log(`⚠️ ${username} não está mais no servidor Discord`);
                continue;
            }

            // Verificar a qual gang o usuário pertence no Discord
            let userGangId = null;

            for (const gang of gangs) {
                if (member.roles.cache.has(gang.roleId)) {
                    userGangId = gang.roleId;
                    break;
                }
            }

            // Se o usuário tem um cargo de gang no Discord, atualizar no banco de dados
            if (userGangId) {
                if (user.gangId !== userGangId) {
                    console.log(`✅ Atualizando ${username} para a gang ${gangMap[userGangId]}`);
                    user.previousGangId = user.gangId;
                    user.gangId = userGangId;
                    await user.save();
                } else {
                    console.log(`✓ ${username} já está na gang correta (${gangMap[userGangId]})`);
                }
            } else {
                // Se o usuário não tem cargo de gang no Discord, remover a associação no banco
                console.log(`⚠️ ${username} não tem cargo de gang no Discord`);
                await User.deleteOne({ _id: user._id });
                console.log(`🗑️ Usuário ${username} removido do banco de dados`);
            }
        }

        console.log('\n📊 Contagem de membros por gang após correções:');
        for (const gang of gangs) {
            const count = await User.countDocuments({ gangId: gang.roleId });
            console.log(`Gang ${gang.name}: ${count} membros`);
        }

    } catch (error) {
        console.error('❌ Erro:', error);
    } finally {
        // Desconectar
        await mongoose.disconnect();
        console.log('📡 Desconectado do MongoDB');
        client.destroy();
        console.log('📡 Desconectado do Discord');
    }
}

main(); 