require('dotenv').config();
const axios = require('axios');

// Deadnads GTD IDs
const deadnadsGtdIds = [
    '1352741917737353226',
    '1344361436536635527',
    '504689198352171038',
    '771732880690511912',
    '836331657296478269',
    '1304725931415306341',
    '1339871900150534187',
    '1065625436320710838',
    '1228065425250586675',
    '1202642183488806932',
    '906911417951715329',
    '870542792244490281',
    '1131166416423366656',
    '344931165548969994',
    '893679173598605373'
];

// Deadnads FCFS IDs
const deadnadsFcfsIds = [
    '642779429411618836',
    '1232685028459151542',
    '1304932403315478573',
    '610672853209317384',
    '1184222267606044763',
    '1030411587003109436',
    '885432584396505108',
    '837584978099437609',
    '881615392550830141',
    '788778570813014086',
    '344931165548969994',
    '849926356258914324',
    '930502485775355944',
    '1007927730072981534',
    '1165000277913509968'
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
        console.log('  2. Ou passe o token como argumento: node get_deadnads_usernames.js SEU_TOKEN');
        process.exit(1);
    }

    console.log('🔍 Buscando usernames...\n');
    
    // Buscar Deadnads GTD
    console.log('📋 Deadnads GTD - Buscando...');
    const gtdResults = [];
    for (const userId of deadnadsGtdIds) {
        const result = await fetchUsername(userId, token);
        gtdResults.push(result);
        if (result.username !== 'ERROR') {
            console.log(`✅ ${result.tag} (${userId})`);
        } else {
            console.log(`❌ ID ${userId} - ${result.error}`);
        }
        await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    // Buscar Deadnads FCFS
    console.log('\n📋 Deadnads FCFS - Buscando...');
    const fcfsResults = [];
    for (const userId of deadnadsFcfsIds) {
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
    console.log('\n📋 LISTA 1: Discord IDs do Deadnads GTD (um por linha)\n');
    deadnadsGtdIds.forEach(id => console.log(id));
    
    console.log('\n' + '='.repeat(60));
    console.log('\n📋 LISTA 2: Discord IDs do Deadnads FCFS (um por linha)\n');
    deadnadsFcfsIds.forEach(id => console.log(id));
    
    console.log('\n' + '='.repeat(60));
    console.log('\n📋 LISTA 3: Usernames do Deadnads GTD (um por linha)\n');
    gtdResults.forEach(r => {
        if (r.username !== 'ERROR') {
            console.log(r.username);
        } else {
            console.log(`ERROR: ${r.id}`);
        }
    });
    
    console.log('\n' + '='.repeat(60));
    console.log('\n📋 LISTA 4: Usernames do Deadnads FCFS (um por linha)\n');
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



