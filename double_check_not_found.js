require('dotenv').config();
const axios = require('axios');

// IDs que retornaram NOT_FOUND (extraídos do CSV)
const notFoundIds = [
    // Mystics FCFS
    '978464684497854534',
    
    // Loot Go GTD
    '1060794031631777803', '885432584396505108', '1103372677005181089',
    '1406882040619733103', '1206619028269961298', '1301291102799790080',
    '740591033322045492', '1131215521107415131', '415119313058398213',
    '1334714483486101539', '602241327920447594', '759053031718780928',
    '1342199110958059580',
    
    // Loot Go FCFS
    '1103372677005181089', '886940460164194335', '1320814652401127466',
    '1311363769800065034', '942862042564546621', '1126593640681181204',
    '278070455414292480', '893681837245886504', '332988026374324225',
    '1422718992665018430', '602241327920447594', '1318991277366181974',
    '865899015668498442', '926606310605225984', '818443287395565579',
    '1184222267606044763', '1060794031631777803', '832953276068528149',
    '948746684018606090', '839648060824092672',
    
    // The 10k Squad (GTD)
    '1272294989161955410', '1165000277913509968', '1286867323747172383',
    '1334714483486101539', '997499241909981286', '857917339524530176',
    '1340682898029678676', '865678798175731773', '1262779385275093047',
    '1231662320891986021', '1335373302780268566', '178591971151970304',
    '924458397213020220', '928617053722656818',
    
    // The 10k Squad (FCFS)
    '1406654764149903421', '680076300337152000', '886940460164194335',
    '417272160755908609', '344931165548969994', '1098610771333746730',
    '876695589872611419',
    
    // Salmoheroo GTD
    '680076300337152000', '1117508071221108959', '1173332236590915644',
    '1350065235016290347', '1046431156813451334', '684438739782598688',
    '1269993290422550559'
];

// Remover duplicados
const uniqueIds = [...new Set(notFoundIds)];

// Função para buscar username com retry
async function fetchUsernameWithRetry(userId, token, maxRetries = 3) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            const response = await axios.get(`https://discord.com/api/v10/users/${userId}`, {
                headers: {
                    'Authorization': `Bot ${token}`
                },
                timeout: 10000 // 10 segundos de timeout
            });

            const user = response.data;
            return {
                id: userId,
                username: user.username,
                discriminator: user.discriminator !== '0' ? `#${user.discriminator}` : '',
                tag: `${user.username}${user.discriminator !== '0' ? `#${user.discriminator}` : ''}`,
                success: true,
                attempt: attempt
            };
        } catch (error) {
            // Se for 404, o usuário realmente não existe
            if (error.response && error.response.status === 404) {
                return {
                    id: userId,
                    username: 'NOT_FOUND',
                    error: '404 - Usuário não encontrado',
                    success: false,
                    attempt: attempt
                };
            }
            
            // Se for 401, problema com o token
            if (error.response && error.response.status === 401) {
                return {
                    id: userId,
                    username: 'NOT_FOUND',
                    error: '401 - Token inválido',
                    success: false,
                    attempt: attempt
                };
            }
            
            // Se não foi na última tentativa, aguarda antes de tentar novamente
            if (attempt < maxRetries) {
                await new Promise(resolve => setTimeout(resolve, 1000 * attempt)); // Backoff exponencial
                continue;
            }
            
            // Última tentativa falhou
            return {
                id: userId,
                username: 'NOT_FOUND',
                error: error.response ? `${error.response.status}: ${error.response.statusText}` : error.message,
                success: false,
                attempt: attempt
            };
        }
    }
}

// Função principal
async function main() {
    const token = process.env.DISCORD_TOKEN || process.argv[2];
    
    if (!token) {
        console.error('❌ Token do Discord não encontrado!');
        process.exit(1);
    }

    console.log(`🔍 Verificando ${uniqueIds.length} IDs únicos que retornaram NOT_FOUND...\n`);
    
    const results = [];
    
    for (const userId of uniqueIds) {
        const result = await fetchUsernameWithRetry(userId, token);
        results.push(result);
        
        if (result.success) {
            console.log(`✅ ${result.tag} (${userId}) - Tentativa ${result.attempt}`);
        } else {
            console.log(`❌ ${userId} - ${result.error} - Tentativa ${result.attempt}`);
        }
        
        // Pequeno delay entre requisições
        await new Promise(resolve => setTimeout(resolve, 200));
    }
    
    // Estatísticas
    const found = results.filter(r => r.success);
    const notFound = results.filter(r => !r.success);
    
    console.log('\n' + '='.repeat(60));
    console.log('\n📊 RESULTADOS:\n');
    console.log(`✅ Encontrados: ${found.length}`);
    console.log(`❌ Não encontrados: ${notFound.length}`);
    
    if (found.length > 0) {
        console.log('\n📋 IDs que foram encontrados agora:\n');
        found.forEach(r => {
            console.log(`  ${r.id} | ${r.tag}`);
        });
    }
    
    console.log('\n' + '='.repeat(60));
    console.log('\n✅ Verificação concluída!');
}

// Executar
main().catch(err => {
    console.error('❌ Erro:', err);
    process.exit(1);
});

