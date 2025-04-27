#!/bin/bash

# Obter o diretório atual (onde o bot está instalado)
BOT_DIR=$(pwd)

# Configura o cron para executar o script de sincronização diariamente à meia-noite
(crontab -l 2>/dev/null || echo "") | grep -v "sync_gang_members.js" | { cat; echo "0 0 * * * cd ${BOT_DIR} && /usr/bin/node ${BOT_DIR}/sync_gang_members.js >> ${BOT_DIR}/logs/sync_gangs.log 2>&1"; } | crontab -

# Criar diretório de logs se não existir
mkdir -p ${BOT_DIR}/logs

echo "✅ Cron job configurado para executar diariamente à meia-noite"
echo "📄 Os logs serão salvos em: ${BOT_DIR}/logs/sync_gangs.log" 