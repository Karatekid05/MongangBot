require('dotenv').config();
const axios = require('axios');

// Lucky Monkeys GTD IDs
const luckyMonkeysGtdIds = [
    '346939977059270657',
    '729278885279170631',
    '621136687107407882',
    '344931165548969994',
    '893685200100393000',
    '684438739782598688',
    '1216283953107959839',
    '1358047873014698054',
    '886940460164194335',
    '538485242420396033'
];

// Lucky Monkeys FCFS IDs
const luckyMonkeysFcfsIds = [
    '1238960982533996608',
    '940033639360647238',
    '893680770512736326',
    '865899015668498442',
    '805059084059410453',
    '1224852135498481725',
    '740591033322045492',
    '919186169336565790',
    '779739986375344139',
    '893683481295593472'
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
        console.log('  2. Ou passe o token como argumento: node get_lucky_monkeys_usernames.js SEU_TOKEN');
        process.exit(1);
    }

    console.log('🔍 Buscando usernames...\n');
    
    // Buscar Lucky Monkeys GTD
    console.log('📋 Lucky Monkeys GTD - Buscando...');
    const gtdResults = [];
    for (const userId of luckyMonkeysGtdIds) {
        const result = await fetchUsername(userId, token);
        gtdResults.push(result);
        if (result.username !== 'ERROR') {
            console.log(`✅ ${result.tag} (${userId})`);
        } else {
            console.log(`❌ ID ${userId} - ${result.error}`);
        }
        await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    // Buscar Lucky Monkeys FCFS
    console.log('\n📋 Lucky Monkeys FCFS - Buscando...');
    const fcfsResults = [];
    for (const userId of luckyMonkeysFcfsIds) {
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
    console.log('\n📋 LISTA 1: Discord IDs do Lucky Monkeys GTD (um por linha)\n');
    luckyMonkeysGtdIds.forEach(id => console.log(id));
    
    console.log('\n' + '='.repeat(60));
    console.log('\n📋 LISTA 2: Discord IDs do Lucky Monkeys FCFS (um por linha)\n');
    luckyMonkeysFcfsIds.forEach(id => console.log(id));
    
    console.log('\n' + '='.repeat(60));
    console.log('\n📋 LISTA 3: Usernames do Lucky Monkeys GTD (um por linha)\n');
    gtdResults.forEach(r => {
        if (r.username !== 'ERROR') {
            console.log(r.username);
        } else {
            console.log(`ERROR: ${r.id}`);
        }
    });
    
    console.log('\n' + '='.repeat(60));
    console.log('\n📋 LISTA 4: Usernames do Lucky Monkeys FCFS (um por linha)\n');
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



