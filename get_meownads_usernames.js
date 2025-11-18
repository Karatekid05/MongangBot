require('dotenv').config();
const axios = require('axios');

// Meownads GTD IDs
const meownadsGtdIds = [
    '1344361436536635527',
    '892954846934761593',
    '1339979674872320105',
    '1333903464626917428',
    '497427314444075021'
];

// Meownads FCFS IDs
const meownadsFcfsIds = [
    '1147181777056694292',
    '893524357140344862',
    '1336406104048930836',
    '1400314703393329273',
    '1237263852224118854',
    '1336323437890764800',
    '1339979674872320105',
    '1098610771333746730',
    '1410560885788905532',
    '680554535470628896'
];

// Função para buscar username usando REST API do Discord
async function fetchUsername(userId, token) {
    try {
        const response = await axios.get(`https://discord.com/api/v10/users/${userId}`, {
            headers: {
                'Authorization': `Bot ${token}`
            }
        });

        const user = response.data;
        return {
            id: userId,
            username: user.username,
            discriminator: user.discriminator !== '0' ? `#${user.discriminator}` : '',
            tag: `${user.username}${user.discriminator !== '0' ? `#${user.discriminator}` : ''}`
        };
    } catch (error) {
        let errorMsg = 'Erro desconhecido';
        if (error.response) {
            if (error.response.status === 401) {
                errorMsg = 'Token inválido ou expirado';
            } else if (error.response.status === 404) {
                errorMsg = 'Usuário não encontrado';
            } else {
                errorMsg = `Erro ${error.response.status}: ${error.response.statusText}`;
            }
        } else {
            errorMsg = error.message;
        }
        return {
            id: userId,
            username: 'ERROR',
            error: errorMsg
        };
    }
}

// Função principal
async function main() {
    const token = process.env.DISCORD_TOKEN || process.argv[2];
    
    if (!token) {
        console.error('❌ Token do Discord não encontrado!');
        console.log('\nUso:');
        console.log('  1. Configure DISCORD_TOKEN no arquivo .env');
        console.log('  2. Ou passe o token como argumento: node get_meownads_usernames.js SEU_TOKEN');
        process.exit(1);
    }

    console.log('🔍 Buscando usernames...\n');
    
    // Buscar Meownads GTD
    console.log('📋 Meownads GTD - Buscando...');
    const gtdResults = [];
    for (const userId of meownadsGtdIds) {
        const result = await fetchUsername(userId, token);
        gtdResults.push(result);
        if (result.username !== 'ERROR') {
            console.log(`✅ ${result.tag} (${userId})`);
        } else {
            console.log(`❌ ID ${userId} - ${result.error}`);
        }
        await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    // Buscar Meownads FCFS
    console.log('\n📋 Meownads FCFS - Buscando...');
    const fcfsResults = [];
    for (const userId of meownadsFcfsIds) {
        const result = await fetchUsername(userId, token);
        fcfsResults.push(result);
        if (result.username !== 'ERROR') {
            console.log(`✅ ${result.tag} (${userId})`);
        } else {
            console.log(`❌ ID ${userId} - ${result.error}`);
        }
        await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    console.log('\n' + '='.repeat(60));
    console.log('\n📋 LISTA 1: Discord IDs do Meownads GTD (um por linha)\n');
    meownadsGtdIds.forEach(id => console.log(id));
    
    console.log('\n' + '='.repeat(60));
    console.log('\n📋 LISTA 2: Discord IDs do Meownads FCFS (um por linha)\n');
    meownadsFcfsIds.forEach(id => console.log(id));
    
    console.log('\n' + '='.repeat(60));
    console.log('\n📋 LISTA 3: Usernames do Meownads GTD (um por linha)\n');
    gtdResults.forEach(r => {
        if (r.username !== 'ERROR') {
            console.log(r.username);
        } else {
            console.log(`ERROR: ${r.id}`);
        }
    });
    
    console.log('\n' + '='.repeat(60));
    console.log('\n📋 LISTA 4: Usernames do Meownads FCFS (um por linha)\n');
    fcfsResults.forEach(r => {
        if (r.username !== 'ERROR') {
            console.log(r.username);
        } else {
            console.log(`ERROR: ${r.id}`);
        }
    });
    
    console.log('\n' + '='.repeat(60));
    console.log('\n✅ Processo concluído!');
}

// Executar
main().catch(err => {
    console.error('❌ Erro:', err);
    process.exit(1);
});



