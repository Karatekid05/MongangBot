require('dotenv').config();
const axios = require('axios');
const fs = require('fs');

// Dados de todas as categorias
const categories = {
    'Monpunks GTD': [
        '1226802111954817067', '740591033322045492', '1272294989161955410', '1152671542975664200',
        '642779429411618836', '1286867323747172383', '680041791780814854', '1322888484096311317',
        '961202772336836629', '1080482878888083536', '893681837245886504', '1183718144662048808',
        '806249930199924737', '1098610771333746730', '1314655017499889754'
    ],
    'Monpunks FCFS': [
        '972981767323676682', '1286867323747172383', '1406654764149903421', '957874992970879037',
        '738657531911733289', '928617053722656818', '953167674324688957', '445682887455539210',
        '1276935245874204770', '1312097145893158962', '1096428474077560952', '1152671542975664200',
        '698579759470477352', '1131166416423366656', '816409283235020800'
    ],
    'Mystics GTD': [
        '837006622593122326', '857917339524530176', '1333061101507579944', '952628975551791174',
        '1320814652401127466', '1072991362925994185', '997499241909981286', '740591033322045492',
        '1253742997137526859', '958214775056236604'
    ],
    'Mystics FCFS': [
        '1422718992665018430', '1239251347891814522', '1342199047502565531', '839648060824092672',
        '978464684497854534'
    ],
    'Loot Go GTD': [
        '779082870949019668', '1060794031631777803', '885432584396505108', '1136732827916959926',
        '1103372677005181089', '1406882040619733103', '1019552456197275669', '1206619028269961298',
        '1301291102799790080', '893682926162694185', '740591033322045492', '1131215521107415131',
        '1187810835855323197', '415119313058398213', '1334714483486101539', '602241327920447594',
        '1274898571510157383', '759053031718780928', '1342199110958059580', '1277455390426009601'
    ],
    'Loot Go FCFS': [
        '1103372677005181089', '886940460164194335', '1131209977160273991', '1320814652401127466',
        '1311363769800065034', '1221458608550576190', '942862042564546621', '1126593640681181204',
        '1170898439492599901', '278070455414292480', '893681837245886504', '917848325892501526',
        '332988026374324225', '1422718992665018430', '343114878074224640', '602241327920447594',
        '1318991277366181974', '1163201156575666206', '865899015668498442', '1166321620898553857',
        '926606310605225984', '818443287395565579', '1184222267606044763', '1261492180422234164',
        '1060794031631777803', '832953276068528149', '978396199830835210', '948746684018606090',
        '839648060824092672', '1051518387915849788'
    ],
    'The 10k Squad (GTD)': [
        '1272294989161955410', '1165000277913509968', '504689198352171038', '1286867323747172383',
        '1334714483486101539', '1202642183488806932', '997499241909981286', '857917339524530176',
        '332988026374324225', '1340682898029678676', '865678798175731773', '1305885398995832903',
        '1262779385275093047', '1231662320891986021', '1335373302780268566', '1198540376940761188',
        '178591971151970304', '924458397213020220', '1216283953107959839', '928617053722656818'
    ],
    'The 10k Squad (FCFS)': [
        '1406654764149903421', '837584978099437609', '680076300337152000', '886940460164194335',
        '893682926162694185', '417272160755908609', '344931165548969994', '738657531911733289',
        '1098610771333746730', '876695589872611419'
    ],
    'Salmoheroo GTD': [
        '660226429396451338', '680076300337152000', '1117508071221108959', '1072991362925994185',
        '1173332236590915644', '1350065235016290347', '1071630438013095936', '1046431156813451334',
        '684438739782598688', '1269993290422550559'
    ]
};

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
            tag: `${user.username}${user.discriminator !== '0' ? `#${user.discriminator}` : ''}`
        };
    } catch (error) {
        return {
            id: userId,
            username: 'NOT_FOUND',
            tag: 'NOT_FOUND'
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
        console.log('  2. Ou passe o token como argumento: node create_winners_csv.js SEU_TOKEN');
        process.exit(1);
    }

    console.log('🔍 Buscando todos os usernames...\n');
    
    // Buscar todos os usernames
    const allResults = {};
    
    for (const [categoryName, userIds] of Object.entries(categories)) {
        console.log(`📋 Buscando ${categoryName}...`);
        const results = [];
        
        for (const userId of userIds) {
            const result = await fetchUsername(userId, token);
            results.push(result);
            if (result.username !== 'NOT_FOUND') {
                console.log(`  ✅ ${result.tag} (${userId})`);
            } else {
                console.log(`  ❌ ID ${userId} - NOT FOUND`);
            }
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        
        allResults[categoryName] = results;
        console.log('');
    }
    
    // Criar o arquivo CSV
    console.log('📝 Criando arquivo CSV...\n');
    
    let csvContent = '';
    
    const categoryNames = Object.keys(categories);
    for (let i = 0; i < categoryNames.length; i++) {
        const categoryName = categoryNames[i];
        const results = allResults[categoryName];
        
        // Título da categoria
        csvContent += `${categoryName}\n`;
        
        // Uma linha em branco
        csvContent += '\n';
        
        // Cabeçalho
        csvContent += 'Discord ID | discord username\n';
        
        // Dados
        for (const result of results) {
            const username = result.username !== 'NOT_FOUND' ? result.username : 'NOT_FOUND';
            csvContent += `${result.id} | ${username}\n`;
        }
        
        // Duas linhas em branco (exceto na última categoria)
        if (i < categoryNames.length - 1) {
            csvContent += '\n\n';
        }
    }
    
    // Escrever o arquivo
    const filename = 'winners.csv';
    fs.writeFileSync(filename, csvContent, 'utf8');
    
    console.log(`✅ Arquivo CSV criado: ${filename}`);
    console.log(`📊 Total de categorias: ${categoryNames.length}`);
    
    // Mostrar estatísticas
    let totalWinners = 0;
    for (const results of Object.values(allResults)) {
        totalWinners += results.length;
    }
    console.log(`👥 Total de ganhadores: ${totalWinners}`);
}

// Executar
main().catch(err => {
    console.error('❌ Erro:', err);
    process.exit(1);
});



