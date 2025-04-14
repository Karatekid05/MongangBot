require('dotenv').config();
const { REST } = require('@discordjs/rest');
const { Routes } = require('discord.js');

// Configuração
const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.DISCORD_CLIENT_ID;
const GUILD_ID = process.env.DISCORD_GUILD_ID; // opcional, apenas se quiser limpar em um servidor específico

// Resetar globalmente (para todos os servidores)
const resetGlobalCommands = async () => {
  try {
    const rest = new REST({ version: '10' }).setToken(TOKEN);
    console.log('Iniciando limpeza de comandos slash globais...');

    // Envia um array vazio para substituir todos os comandos
    await rest.put(Routes.applicationCommands(CLIENT_ID), { body: [] });
    console.log('Comandos slash globais foram limpos com sucesso!');
  } catch (error) {
    console.error('Erro ao limpar comandos slash globais:', error);
  }
};

// Resetar em um servidor específico (opcional)
const resetGuildCommands = async () => {
  if (!GUILD_ID) {
    console.log('GUILD_ID não está definido no .env, pulando limpeza de comandos do servidor');
    return;
  }

  try {
    const rest = new REST({ version: '10' }).setToken(TOKEN);
    console.log(`Iniciando limpeza de comandos slash no servidor ${GUILD_ID}...`);

    // Envia um array vazio para substituir todos os comandos no servidor
    await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: [] });
    console.log(`Comandos slash no servidor ${GUILD_ID} foram limpos com sucesso!`);
  } catch (error) {
    console.error('Erro ao limpar comandos slash do servidor:', error);
  }
};

// Executar ambas as operações
(async () => {
  await resetGlobalCommands();
  await resetGuildCommands();
  console.log('Processo de limpeza completo!');
})(); 