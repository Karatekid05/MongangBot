require('dotenv').config();
const fs = require('fs');
const { Client, GatewayIntentBits } = require('discord.js');

async function updateEnvFile() {
    // Verificar se o token do Discord está presente
    if (!process.env.DISCORD_TOKEN) {
        console.error('❌ DISCORD_TOKEN não encontrado no arquivo .env');
        process.exit(1);
    }

    // Criar cliente Discord
    const client = new Client({
        intents: [GatewayIntentBits.Guilds]
    });

    try {
        // Login no Discord
        await client.login(process.env.DISCORD_TOKEN);
        console.log('✅ Login no Discord realizado com sucesso');

        // Aguardar o cliente estar pronto
        await new Promise(resolve => {
            if (client.isReady()) resolve();
            else client.once('ready', resolve);
        });

        // Obter o primeiro servidor (guild) disponível
        const guilds = [...client.guilds.cache.values()];

        if (guilds.length === 0) {
            console.error('❌ O bot não está em nenhum servidor');
            process.exit(1);
        }

        // Se houver mais de um servidor, listar todos para escolha
        if (guilds.length > 1) {
            console.log('📋 Servidores disponíveis:');
            guilds.forEach((guild, index) => {
                console.log(`${index + 1}. ${guild.name} (ID: ${guild.id})`);
            });
            console.log('\n⚠️ Múltiplos servidores encontrados. Por favor, atualize manualmente a variável DISCORD_GUILD_ID no arquivo .env');
            process.exit(0);
        }

        const guild = guilds[0];
        console.log(`✅ Servidor encontrado: ${guild.name} (ID: ${guild.id})`);

        // Ler o conteúdo atual do arquivo .env
        const envContent = fs.readFileSync('.env', 'utf8');

        // Verificar qual variável existe no arquivo .env
        let updatedContent = envContent;
        let variableUpdated = false;

        // Verificar se existe DISCORD_GUILD_ID (formato preferido)
        if (envContent.includes('DISCORD_GUILD_ID=')) {
            updatedContent = envContent.replace(
                /DISCORD_GUILD_ID=.*/,
                `DISCORD_GUILD_ID=${guild.id}`
            );
            variableUpdated = true;
            console.log('✅ Variável DISCORD_GUILD_ID atualizada');
        }
        // Verificar se existe GUILD_ID
        else if (envContent.includes('GUILD_ID=')) {
            updatedContent = envContent.replace(
                /GUILD_ID=.*/,
                `GUILD_ID=${guild.id}`
            );
            variableUpdated = true;
            console.log('✅ Variável GUILD_ID atualizada');
        }

        // Se nenhuma variável foi encontrada, adicionar DISCORD_GUILD_ID (formato preferido)
        if (!variableUpdated) {
            updatedContent += `\nDISCORD_GUILD_ID=${guild.id}\n`;
            console.log('✅ Variável DISCORD_GUILD_ID adicionada');
        }

        // Salvar o arquivo atualizado
        fs.writeFileSync('.env', updatedContent);
        console.log(`✅ Arquivo .env atualizado com o Guild ID: ${guild.id}`);

    } catch (error) {
        console.error('❌ Erro ao obter informações do servidor:', error);
    } finally {
        client.destroy();
    }
}

updateEnvFile(); 