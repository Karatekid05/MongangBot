require('dotenv').config();
const axios = require('axios');

// Llamao GTD IDs
const llamaoGtdIds = [
    '948746684018606090',
    '1211287476245626921',
    '1071630438013095936',
    '828753918049255514',
    '401425773673709578',
    '958214775056236604',
    '844821960810168321',
    '632023653856444428',
    '1276918213568893058',
    '893685722878447718'
];

// Llamao FCFS IDs
const llamaoFcfsIds = [
    '1177384622011727954',
    '1261492180422234164',
    '1216698660524392570',
    '1281650265514184824',
    '1063121472492666971',
    '952763630095585290',
    '1320814652401127466',
    '1145722007971971154',
    '822029256502018100',
    '1338123695972946003'
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
        console.log('  2. Ou passe o token como argumento: node get_llamao_usernames.js SEU_TOKEN');
        process.exit(1);
    }

    console.log('🔍 Buscando usernames...\n');
    
    // Buscar Llamao GTD
    console.log('📋 Llamao GTD - Buscando...');
    const gtdResults = [];
    for (const userId of llamaoGtdIds) {
        const result = await fetchUsername(userId, token);
        gtdResults.push(result);
        if (result.username !== 'ERROR') {
            console.log(`✅ ${result.tag} (${userId})`);
        } else {
            console.log(`❌ ID ${userId} - ${result.error}`);
        }
        await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    // Buscar Llamao FCFS
    console.log('\n📋 Llamao FCFS - Buscando...');
    const fcfsResults = [];
    for (const userId of llamaoFcfsIds) {
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
    console.log('\n📋 LISTA 1: Discord IDs do Llamao GTD (um por linha)\n');
    llamaoGtdIds.forEach(id => console.log(id));
    
    console.log('\n' + '='.repeat(60));
    console.log('\n📋 LISTA 2: Discord IDs do Llamao FCFS (um por linha)\n');
    llamaoFcfsIds.forEach(id => console.log(id));
    
    console.log('\n' + '='.repeat(60));
    console.log('\n📋 LISTA 3: Usernames do Llamao GTD (um por linha)\n');
    gtdResults.forEach(r => {
        if (r.username !== 'ERROR') {
            console.log(r.username);
        } else {
            console.log(`ERROR: ${r.id}`);
        }
    });
    
    console.log('\n' + '='.repeat(60));
    console.log('\n📋 LISTA 4: Usernames do Llamao FCFS (um por linha)\n');
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



