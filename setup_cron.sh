#!/bin/bash

# Obter o diretório atual (onde o bot está instalado)
BOT_DIR=$(pwd)

# Configura o cron para executar o script de sincronização diariamente à meia-noite
(crontab -l 2>/dev/null || echo "") | grep -v "sync_gang_members.js" | { cat; echo "0 0 * * * cd ${BOT_DIR} && /usr/bin/node ${BOT_DIR}/sync_gang_members.js >> ${BOT_DIR}/logs/sync_gangs.log 2>&1"; } | crontab -

# Criar diretório de logs se não existir
mkdir -p ${BOT_DIR}/logs

echo "✅ Cron job configurado para executar diariamente à meia-noite"
echo "📄 Os logs serão salvos em: ${BOT_DIR}/logs/sync_gangs.log" 
echo ""
echo "ℹ️  Nota: O bot também possui agendamentos internos:"
echo "   • 23:00 UTC - Sincronização de NFTs e distribuição de recompensas"
echo "   • 23:10 UTC - Distribuição de 500 \$CASH para role 1385211569872310324"
echo "   • 03:00 UTC (Segundas) - Reset semanal e exportação de dados" 