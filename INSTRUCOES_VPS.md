# Instruções para Corrigir Usuários das Gangs na VPS

## Problema
Alguns usuários mudaram de gang no Discord mas o perfil deles no bot não atualizou, mesmo eles tendo um cargo de um gang diferente.

## Solução
Execute o script `fix_gang_members_vps.js` na VPS onde o bot está rodando.

## Passos:

### 1. Acesse a VPS
```bash
ssh seu_usuario@ip_da_vps
cd /caminho/para/MongangBot-1
```

### 2. Execute o script
```bash
node fix_gang_members_vps.js
```

### 3. O que o script vai fazer:
- ✅ **Backup automático** dos usuários antes de qualquer alteração
- ✅ **Verificar** cada usuário no banco de dados
- ✅ **Comparar** com os cargos reais no Discord
- ✅ **Corrigir** usuários que estão com gang incorreta
- ✅ **Remover** usuários que não estão mais no servidor
- ✅ **Salvar** contribuições para a gang anterior

### 4. Resultado esperado:
- Usuários que mudaram de gang terão o perfil atualizado
- Comandos como `/profile` vão mostrar a gang correta
- Leaderboards vão refletir as mudanças
- Bot continua funcionando normalmente

### 5. Se algo der errado:
Para reverter as mudanças, use:
```bash
node restore_users.js backup_users_YYYY-MM-DDTHH-MM-SS-000Z.json
```

## Arquivos criados:
- `fix_gang_members_vps.js` - Script principal
- `restore_users.js` - Script para reverter mudanças
- `backup_users_*.json` - Backup automático dos usuários

## Segurança:
- ✅ Script só lê e corrige dados
- ✅ Não para o bot
- ✅ Backup automático antes de alterações
- ✅ Pode ser revertido se necessário

## Exemplo de saída esperada:
```
🔧 Iniciando backup e correção de membros das gangs...
✅ Conectado ao MongoDB
💾 Criando backup dos usuários...
📊 Total de usuários encontrados: 150
✅ Backup criado: backup_users_2024-01-15T10-30-00-000Z.json
📊 Usuários por gang ANTES da correção:
   SeaKings: 45 usuários
   ThunderBirds: 38 usuários
   ChunkyCats: 35 usuários
   FluffyNinjas: 32 usuários
🔧 Iniciando correção de usuários...
🔄 Corrigindo gang do usuário João: SeaKings -> ThunderBirds
✅ Gang corrigida para João: Thunder Birds
✅ Correção concluída!
📊 Resumo:
   - Usuários corrigidos: 5
   - Usuários removidos: 2
   - Backup criado: backup_users_2024-01-15T10-30-00-000Z.json
``` 