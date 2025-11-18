require('dotenv').config();
const axios = require('axios');
const fs = require('fs');

// Mapeamento dos IDs que foram encontrados na segunda verificação
const foundUsernames = {
    '978464684497854534': 'nubestbr',
    '1060794031631777803': 'trade_600',
    '885432584396505108': 'millioncrypto04',
    '1103372677005181089': 'francis1000',
    '1406882040619733103': 'haal6531',
    '1206619028269961298': 'silencer2334',
    '1301291102799790080': 'freakyweb3_76687',
    '740591033322045492': 'anirvande2008',
    '1131215521107415131': 'linhkutexinh',
    '415119313058398213': 'bb0832',
    '1334714483486101539': 'cryptopinkjava',
    '602241327920447594': 'bigsbt',
    '759053031718780928': 'blackjinyt',
    '1342199110958059580': 'rustyrog_99',
    '886940460164194335': 'vera2205',
    '1320814652401127466': 'joy4191.',
    '1311363769800065034': '0x_uznik',
    '942862042564546621': 'otkatizakati',
    '1126593640681181204': 'void.nom.ad',
    '278070455414292480': 'smtngfishy',
    '893681837245886504': 'kylan3413',
    '332988026374324225': 'howtosleep.',
    '1422718992665018430': 'alyxstar71',
    '1318991277366181974': 'thenima',
    '865899015668498442': 'osotnas123',
    '926606310605225984': 'pereebu',
    '818443287395565579': 'bond4362',
    '1184222267606044763': 'jawirhitam1',
    '832953276068528149': 'trinityxd0',
    '948746684018606090': 'shadow_puddle',
    '839648060824092672': 'krahbtc',
    '1272294989161955410': 'miftapain',
    '1165000277913509968': '0x7shanks',
    '1286867323747172383': 'snowie90.',
    '997499241909981286': 'monurohila',
    '857917339524530176': 'cristypuiu',
    '1340682898029678676': 'bockopoc_81234',
    '865678798175731773': 'ph_zmn',
    '1262779385275093047': 'abdul_1319929',
    '1231662320891986021': 'rivalsavior',
    '1335373302780268566': 'felisemia',
    '178591971151970304': 'zalim_2.0',
    '924458397213020220': '6rjqax6cl4gz',
    '928617053722656818': 'andrei019780',
    '1406654764149903421': 'priceyasfock',
    '680076300337152000': 'jomahstm',
    '417272160755908609': 'maxgalll',
    '344931165548969994': 'punisherpleak',
    '1098610771333746730': 'jsmithguru',
    '876695589872611419': 'mcnftfullforce',
    '1117508071221108959': 'nash_nx',
    '1173332236590915644': 'dreylord999',
    '1350065235016290347': 'redwooddawg_29277',
    '1046431156813451334': 'accredited01',
    '684438739782598688': 'gojnads',
    '1269993290422550559': 'mehadihasan69'
};

// Ler o arquivo CSV
const csvContent = fs.readFileSync('winners.csv', 'utf8');

// Substituir todos os NOT_FOUND pelos usernames corretos
let updatedContent = csvContent;
for (const [id, username] of Object.entries(foundUsernames)) {
    // Substituir "ID | NOT_FOUND" por "ID | username"
    const regex = new RegExp(`(${id}) \\| NOT_FOUND`, 'g');
    updatedContent = updatedContent.replace(regex, `$1 | ${username}`);
}

// Escrever o arquivo atualizado
fs.writeFileSync('winners.csv', updatedContent, 'utf8');

console.log('✅ Arquivo winners.csv atualizado com os usernames corretos!');
console.log(`📊 Total de correções: ${Object.keys(foundUsernames).length}`);

