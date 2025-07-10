require('dotenv').config();
const { Client, GatewayIntentBits } = require('discord.js');
const XLSX = require('xlsx');
const fs = require('fs');

// Create a test client
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers
    ]
});

async function testExportUsers() {
    try {
        console.log('🔄 Iniciando teste do comando /exportusers...');
        
        // Login to Discord
        await client.login(process.env.DISCORD_TOKEN);
        console.log('✅ Bot conectado ao Discord');

        // Wait for client to be ready
        await new Promise(resolve => client.once('ready', resolve));
        console.log('✅ Bot pronto para uso');

        // Get the guild
        const guildId = process.env.DISCORD_GUILD_ID;
        const guild = client.guilds.cache.get(guildId);
        
        if (!guild) {
            throw new Error(`Guild não encontrado: ${guildId}`);
        }

        console.log(`🏢 Servidor: ${guild.name} (${guild.id})`);
        
        // Fetch all guild members
        console.log('📥 Buscando todos os membros do servidor...');
        await guild.members.fetch();
        console.log(`📊 Total de membros encontrados: ${guild.members.cache.size}`);

        // Get all roles and sort by position (hierarchy)
        const roles = guild.roles.cache
            .filter(role => role.name !== '@everyone') // Exclude @everyone role
            .sort((a, b) => b.position - a.position); // Sort by position (higher position = higher hierarchy)

        console.log(`🏷️ Total de cargos encontrados: ${roles.size}`);
        console.log('\n📋 Cargos por hierarquia:');
        
        roles.forEach((role, index) => {
            const memberCount = role.members.filter(member => !member.user.bot).size;
            console.log(`   ${index + 1}. ${role.name} (Posição: ${role.position}, Membros: ${memberCount})`);
        });

        // Prepare data for Excel
        const userData = [];
        let totalProcessed = 0;

        console.log('\n🔄 Processando usuários por cargo...');

        // Process each role from highest to lowest
        for (const [roleId, role] of roles) {
            // Get members with this role
            const membersWithRole = role.members.filter(member => !member.user.bot);
            
            if (membersWithRole.size > 0) {
                console.log(`   📝 Processando cargo: ${role.name} (${membersWithRole.size} membros)`);
                
                // Add each member to the data
                membersWithRole.forEach(member => {
                    userData.push({
                        Username: member.user.username,
                        Role: role.name,
                        'Role Position': role.position,
                        'User ID': member.user.id,
                        'Joined Server': member.joinedAt ? member.joinedAt.toLocaleDateString('pt-BR') : 'Desconhecido',
                        'Account Created': member.user.createdAt.toLocaleDateString('pt-BR')
                    });
                    totalProcessed++;
                });
            }
        }

        // Also add members without any special roles (only @everyone)
        const membersWithoutRoles = guild.members.cache.filter(member => 
            !member.user.bot && 
            member.roles.cache.size === 1 && // Only has @everyone role
            member.roles.cache.has(guild.roles.everyone.id)
        );

        if (membersWithoutRoles.size > 0) {
            console.log(`   📝 Adicionando ${membersWithoutRoles.size} membros sem cargos especiais`);
            membersWithoutRoles.forEach(member => {
                userData.push({
                    Username: member.user.username,
                    Role: 'Sem Cargo',
                    'Role Position': 0,
                    'User ID': member.user.id,
                    'Joined Server': member.joinedAt ? member.joinedAt.toLocaleDateString('pt-BR') : 'Desconhecido',
                    'Account Created': member.user.createdAt.toLocaleDateString('pt-BR')
                });
                totalProcessed++;
            });
        }

        // Remove duplicates (users might have multiple roles, we want the highest role)
        const uniqueUserData = [];
        const seenUsers = new Set();

        for (const user of userData) {
            if (!seenUsers.has(user['User ID'])) {
                seenUsers.add(user['User ID']);
                uniqueUserData.push(user);
            }
        }

        console.log(`\n📊 Estatísticas do processamento:`);
        console.log(`   • Total de usuários processados: ${totalProcessed}`);
        console.log(`   • Usuários únicos (após remoção de duplicatas): ${uniqueUserData.length}`);
        console.log(`   • Usuários duplicados removidos: ${totalProcessed - uniqueUserData.length}`);

        // Sort by role position (descending) then by username
        uniqueUserData.sort((a, b) => {
            if (a['Role Position'] !== b['Role Position']) {
                return b['Role Position'] - a['Role Position'];
            }
            return a.Username.localeCompare(b.Username);
        });

        console.log('\n📋 Primeiros 10 usuários na lista final:');
        uniqueUserData.slice(0, 10).forEach((user, index) => {
            console.log(`   ${index + 1}. ${user.Username} - ${user.Role} (Posição: ${user['Role Position']})`);
        });

        // Create Excel workbook
        console.log('\n📊 Criando arquivo Excel...');
        const workbook = XLSX.utils.book_new();
        
        // Create worksheet from data
        const worksheet = XLSX.utils.json_to_sheet(uniqueUserData);
        
        // Auto-size columns
        const columnWidths = [
            { wch: 25 }, // Username
            { wch: 20 }, // Role
            { wch: 15 }, // Role Position
            { wch: 20 }, // User ID
            { wch: 15 }, // Joined Server
            { wch: 15 }  // Account Created
        ];
        worksheet['!cols'] = columnWidths;

        // Add worksheet to workbook
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Server Users');

        // Generate Excel file
        const timestamp = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
        const filename = `test_server_users_${guild.name.replace(/[^a-zA-Z0-9]/g, '_')}_${timestamp}.xlsx`;
        
        XLSX.writeFile(workbook, filename);

        console.log(`\n✅ Arquivo Excel criado com sucesso: ${filename}`);
        console.log(`📁 Localização: ${process.cwd()}/${filename}`);
        console.log(`📊 Total de usuários exportados: ${uniqueUserData.length}`);

        // Show file size
        const stats = fs.statSync(filename);
        console.log(`📦 Tamanho do arquivo: ${(stats.size / 1024).toFixed(2)} KB`);

        console.log('\n🎉 Teste concluído com sucesso!');

    } catch (error) {
        console.error('❌ Erro durante o teste:', error);
    } finally {
        // Disconnect from Discord
        client.destroy();
        console.log('📡 Desconectado do Discord');
        process.exit(0);
    }
}

// Run the test
testExportUsers(); 