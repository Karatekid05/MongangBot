require('dotenv').config();
const axios = require('axios');

// User IDs para buscar
const userIds = [
    '857917339524530176',
    '743031011234807848',
    '967515714862866472',
    '1332812795892334692',
    '1400314703393329273',
    '1183310540571942994',
    '1316657819138785302',
    '486430553827049481',
    '779739986375344139',
    '1029706091405254666',
    '1072991362925994185',
    '1145294582280630332',
    '723129233706057738',
    '680554535470628896',
    '1106747516160065626',
    '445682887455539210',
    '1341825866153328783',
    '1335379237234020415',
    '1014994320832614400',
    '1071630438013095936'
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
        console.log('  2. Ou passe o token como argumento: node get_usernames.js SEU_TOKEN');
        process.exit(1);
    }

    console.log('🔍 Buscando usernames...\n');
    
    const results = [];
    
    for (const userId of userIds) {
        const result = await fetchUsername(userId, token);
        results.push(result);
        
        if (result.username !== 'ERROR') {
            console.log(`✅ ${result.tag} (${userId})`);
        } else {
            console.log(`❌ ID ${userId} - ${result.error}`);
        }
        
        // Pequeno delay para não sobrecarregar a API
        await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    console.log('\n' + '='.repeat(60));
    console.log('\n📋 RESULTADO FINAL:\n');
    
    // Formato lista simples
    console.log('Usernames:');
    results.forEach(r => {
        if (r.username !== 'ERROR') {
            console.log(`- ${r.tag}`);
        }
    });
    
    console.log('\n' + '='.repeat(60));
    console.log('\n📝 Formato para mensagem:\n');
    
    // Formato similar ao original
    const usernamesList = results
        .filter(r => r.username !== 'ERROR')
        .map(r => r.tag)
        .join(', ');
    
    console.log(`Congratulations ${usernamesList}! You won the **Monshape FCFS**!`);
    
    console.log('\n' + '='.repeat(60));
    console.log('\n✅ Processo concluído!');
}

// Executar
main().catch(err => {
    console.error('❌ Erro:', err);
    process.exit(1);
});

