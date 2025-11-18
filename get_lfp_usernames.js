require('dotenv').config();
const axios = require('axios');

// LFP GTD IDs
const lfpGtdIds = [
    '1131204289142988853',
    '1005426944071962685',
    '1323620908870533150',
    '518789647548022794',
    '1315372818036297810',
    '865678798175731773',
    '836331657296478269',
    '1276928352136986809',
    '1184222267606044763',
    '1106680865653784637'
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
        console.log('  2. Ou passe o token como argumento: node get_lfp_usernames.js SEU_TOKEN');
        process.exit(1);
    }

    console.log('🔍 Buscando usernames do LFP GTD...\n');
    
    const results = [];
    for (const userId of lfpGtdIds) {
        const result = await fetchUsername(userId, token);
        results.push(result);
        if (result.username !== 'ERROR') {
            console.log(`✅ ${result.tag} (${userId})`);
        } else {
            console.log(`❌ ID ${userId} - ${result.error}`);
        }
        await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    console.log('\n' + '='.repeat(60));
    console.log('\n📋 LISTA 1: Discord IDs do LFP GTD (um por linha)\n');
    lfpGtdIds.forEach(id => console.log(id));
    
    console.log('\n' + '='.repeat(60));
    console.log('\n📋 LISTA 2: Usernames do LFP GTD (um por linha)\n');
    results.forEach(r => {
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



