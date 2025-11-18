require('dotenv').config();
const axios = require('axios');

// Canz GTD IDs
const canzGtdIds = [
    '1145294582280630332',
    '851551533953974364',
    '926523821752729702',
    '1193771913475018765',
    '810668321724825664'
];

// Canz FCFS IDs
const canzFcfsIds = [
    '456832585947938828',
    '1181043576004694099',
    '485442194791202837',
    '1034514944512753765',
    '1227613910090121309',
    '1228065425250586675',
    '1239278037145485323',
    '981606325857431573',
    '1118254585505648722',
    '432338424058609685',
    '1117490317243994246',
    '1199800539790192710',
    '810668321724825664',
    '1350065235016290347',
    '1269993290422550559',
    '723129233706057738',
    '1145294582280630332',
    '1159483800099758081',
    '401058172430843906',
    '1258798719755747399'
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
        console.log('  2. Ou passe o token como argumento: node get_canz_usernames.js SEU_TOKEN');
        process.exit(1);
    }

    console.log('🔍 Buscando usernames...\n');
    
    // Buscar Canz GTD
    console.log('📋 Canz GTD - Buscando...');
    const gtdResults = [];
    for (const userId of canzGtdIds) {
        const result = await fetchUsername(userId, token);
        gtdResults.push(result);
        if (result.username !== 'ERROR') {
            console.log(`✅ ${result.tag} (${userId})`);
        } else {
            console.log(`❌ ID ${userId} - ${result.error}`);
        }
        await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    // Buscar Canz FCFS
    console.log('\n📋 Canz FCFS - Buscando...');
    const fcfsResults = [];
    for (const userId of canzFcfsIds) {
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
    console.log('\n📋 LISTA 1: Discord IDs do Canz GTD (um por linha)\n');
    canzGtdIds.forEach(id => console.log(id));
    
    console.log('\n' + '='.repeat(60));
    console.log('\n📋 LISTA 2: Discord IDs do Canz FCFS (um por linha)\n');
    canzFcfsIds.forEach(id => console.log(id));
    
    console.log('\n' + '='.repeat(60));
    console.log('\n📋 LISTA 3: Usernames do Canz GTD (um por linha)\n');
    gtdResults.forEach(r => {
        if (r.username !== 'ERROR') {
            console.log(r.username);
        } else {
            console.log(`ERROR: ${r.id}`);
        }
    });
    
    console.log('\n' + '='.repeat(60));
    console.log('\n📋 LISTA 4: Usernames do Canz FCFS (um por linha)\n');
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



