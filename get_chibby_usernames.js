require('dotenv').config();
const axios = require('axios');

// Chibby WL IDs
const chibbyWlIds = [
    '837584978099437609',
    '694909327965683832',
    '1011614850717331456',
    '235469456753688576',
    '580668353019117588'
];

// Chibby FCFS IDs
const chibbyFcfsIds = [
    '380738483532070914',
    '1232389107221528607',
    '1333104419339898950',
    '235469456753688576',
    '310902356092911627',
    '1046431156813451334',
    '1103562592955412550',
    '893682926162694185',
    '753999423553536040',
    '708965428613087253',
    '1211287476245626921',
    '1320814652401127466',
    '329004662680190984',
    '1136398265194127550',
    '935169482819792936',
    '245514709367914496',
    '635512995258171411',
    '445682887455539210',
    '710469482975330315',
    '437865806961836043'
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
        console.log('  2. Ou passe o token como argumento: node get_chibby_usernames.js SEU_TOKEN');
        process.exit(1);
    }

    console.log('🔍 Buscando usernames...\n');
    
    // Buscar Chibby WL
    console.log('📋 Chibby WL - Buscando...');
    const wlResults = [];
    for (const userId of chibbyWlIds) {
        const result = await fetchUsername(userId, token);
        wlResults.push(result);
        if (result.username !== 'ERROR') {
            console.log(`✅ ${result.tag} (${userId})`);
        } else {
            console.log(`❌ ID ${userId} - ${result.error}`);
        }
        await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    // Buscar Chibby FCFS
    console.log('\n📋 Chibby FCFS - Buscando...');
    const fcfsResults = [];
    for (const userId of chibbyFcfsIds) {
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
    console.log('\n📋 LISTA 1: Discord IDs do Chibby WL (um por linha)\n');
    chibbyWlIds.forEach(id => console.log(id));
    
    console.log('\n' + '='.repeat(60));
    console.log('\n📋 LISTA 2: Discord IDs do Chibby FCFS (um por linha)\n');
    chibbyFcfsIds.forEach(id => console.log(id));
    
    console.log('\n' + '='.repeat(60));
    console.log('\n📋 LISTA 3: Usernames do Chibby WL (um por linha)\n');
    wlResults.forEach(r => {
        if (r.username !== 'ERROR') {
            console.log(r.username);
        } else {
            console.log(`ERROR: ${r.id}`);
        }
    });
    
    console.log('\n' + '='.repeat(60));
    console.log('\n📋 LISTA 4: Usernames do Chibby FCFS (um por linha)\n');
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



