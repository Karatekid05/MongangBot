const { REST, Routes } = require('discord.js');
const fs = require('fs');
const path = require('path');

/**
 * Load all commands from the commands directory
 * @param {Client} client - Discord.js client
 */
function loadCommands(client) {
    const commands = [];
    const commandsPath = path.join(__dirname, '../commands');
    const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

    // Lista para verificar nomes duplicados
    const commandNames = new Set();

    console.log(`Loading commands from ${commandFiles.length} files...`);

    for (const file of commandFiles) {
        const filePath = path.join(commandsPath, file);
        try {
            // Limpar o cache do módulo para recarregar alterações
            delete require.cache[require.resolve(filePath)];

            const command = require(filePath);

            // Set a new item in the Collection with the key as the command name and the value as the exported module
            if ('data' in command && 'execute' in command) {
                const commandName = command.data.name;

                // Verificar se o nome de comando já existe
                if (!commandNames.has(commandName)) {
                    commandNames.add(commandName);
                    client.commands.set(commandName, command);
                    commands.push(command.data.toJSON());
                    console.log(`✅ Command loaded: ${commandName} from ${file}`);
                } else {
                    console.log(`⚠️ Duplicate command name detected: ${commandName} in ${file} - ignoring`);
                }
            } else {
                console.log(`❌ WARNING: The command at ${filePath} is missing a required "data" or "execute" property.`);
            }
        } catch (error) {
            console.error(`❌ Error loading command from ${file}:`, error);
        }
    }

    // Verificar que temos comandos para registrar
    if (commands.length === 0) {
        console.log("No commands found to register!");
        return;
    }

    // Register slash commands
    const rest = new REST().setToken(process.env.DISCORD_TOKEN);

    (async () => {
        try {
            console.log(`Started refreshing ${commands.length} application (/) commands.`);

            // Listar nomes de comandos a serem registrados
            const commandNamesString = commands.map(cmd => cmd.name).join(", ");
            console.log(`Registering commands: ${commandNamesString}`);

            await rest.put(
                Routes.applicationCommands(process.env.DISCORD_CLIENT_ID),
                { body: commands },
            );

            console.log('Successfully reloaded application (/) commands.');
        } catch (error) {
            console.error('Error registering commands:', error);
        }
    })();
}

module.exports = { loadCommands }; 