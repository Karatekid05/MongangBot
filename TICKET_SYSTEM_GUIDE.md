# 🎫 Sistema de Tickets - Guia Simplificado

## Visão Geral
O sistema de tickets permite criar eventos onde usuários podem comprar tickets com $CASH e receber roles automaticamente. Ideal para loterias, torneios, poker e outros eventos.

## 🎮 Tipos de Eventos

### 1. **Lottery (Loteria)**
- Usuários compram tickets numerados
- Sorteio automático com prêmios
- Distribuição: 1º 50%, 2º 30%, 3º 20%

### 2. **Poker**
- Buy-in com $CASH
- Distribuição de prêmios aos vencedores
- Role automático para participantes

### 3. **Tournament (Torneio)**
- Similar ao poker
- Ideal para torneios de Smash, etc.
- Lista de participantes exportável

### 4. **Custom**
- Evento personalizado
- Role automático
- Flexível para qualquer uso

## 📋 Comandos Disponíveis

### Para Moderadores

#### `/createticket` - Criar novo ticket
```
/createticket name:"Poker Semanal" description:"Torneio de Poker Semanal" price:100 max_tickets:50 role_id:"123456789" role_name:"Poker Player" event_type:poker max_per_user:1 auto_assign_role:true time_limit_date:"2024-01-20 18:00"
```

**Parâmetros:**
- `name`: Nome do evento
- `description`: Descrição detalhada
- `price`: Preço em $CASH por ticket
- `max_tickets`: Número máximo de tickets
- `role_id`: ID do role no Discord
- `role_name`: Nome do role (para exibição)
- `event_type`: lottery/poker/tournament/custom
- `max_per_user`: Máximo de tickets por usuário (1-10)
- `auto_assign_role`: Atribuir role automaticamente (padrão: true)
- `time_limit_date`: Data limite (YYYY-MM-DD HH:MM) - **opcional**

#### `/manageticket` - Gerenciar tickets
```
/manageticket ticket_name:"Poker Semanal" action:details
```

**Ações disponíveis:**
- `details`: Ver detalhes completos
- `pause`: Pausar vendas
- `activate`: Reativar vendas
- `cancel`: Cancelar evento
- `complete`: Marcar como completo
- `🗑️ delete`: **Deletar (Irreversível)** - Remove ticket e todas as compras
- `💰 refund`: **Cancelar e Reembolsar** - Cancela e reembolsa todos

**Para delete/refund:**
```
/manageticket ticket_name:"Poker Semanal" action:delete confirm:true remove_roles:true
```

#### `/drawlottery` - Realizar sorteio
```
/drawlottery ticket_name:"Loteria WL"
```

#### `/exportparticipants` - Exportar participantes
```
/exportparticipants type:ticket identifier:"Poker Semanal" format:csv
```

**Tipos de exportação:**
- `type:role` - Por role (ID do role)
- `type:ticket` - Por ticket específico (nome do ticket)
- `format:csv` - Arquivo CSV para download
- `format:list` - Lista simples no Discord

### Para Usuários

#### `/tickets` - Ver tickets disponíveis
```
/tickets
```

#### `/buyticket` - Comprar tickets
```
/buyticket ticket_name:"Poker Semanal" quantity:1
```
**ou simplesmente:**
```
/buyticket
```
(mostra lista interativa de tickets disponíveis)

## 🗑️ Sistema de Delete/Remoção

### **2 Opções de Delete:**

#### 1. **🗑️ Deletar Completamente (IRREVERSÍVEL)**
- Remove ticket permanentemente do banco
- Deleta todas as compras e histórico
- Remove roles dos participantes
- **NÃO PODE SER DESFEITO**

#### 2. **💰 Cancelar e Reembolsar (SEGURO)**
- Cancela o ticket (mantém no banco)
- Reembolsa TODOS os participantes
- Remove roles automaticamente
- Mantém histórico para auditoria

### **Fluxo de Segurança:**
1. **Primeira execução**: Mostra aviso detalhado com estatísticas
2. **Confirmação obrigatória**: `confirm:true` é necessário
3. **Log completo**: Todas as ações são registradas

### **Exemplos de Uso:**

**Deletar evento que não foi bem:**
```
/manageticket ticket_name:"Evento Ruim" action:delete confirm:true
```

**Cancelar evento e reembolsar todos:**
```
/manageticket ticket_name:"Evento Cancelado" action:refund confirm:true
```

## ⏰ Sistema de Tempo

### **Limite de Tempo Simples**
- Define data/hora limite para vendas (opcional)
- Se não definido, não há limite de tempo
- Quando expira, ticket fica em estado "pre-delete"

### **Estado Pre-Delete**
- Tickets expirados ficam em estado final
- Apenas permite exportar dados ou deletar
- Não permite mais compras
- Moderadores podem deletar quando quiserem

## 🎯 Casos de Uso

### 1. **Poker Semanal com Tempo**
```
/createticket name:"Poker Semanal" description:"Torneio de Poker Semanal - Buy-in 100 $CASH" price:100 max_tickets:50 role_id:"123456789" role_name:"Poker Player" event_type:poker max_per_user:1 auto_assign_role:true time_limit_date:"2024-01-20 18:00"
```

**Fluxo:**
1. Usuários compram tickets até 20/01 às 18:00
2. Role "Poker Player" é atribuído automaticamente
3. Evento expira às 18:00 e fica em pre-delete
4. Moderador pode exportar participantes ou deletar

### 2. **Loteria de Whitelist com Tempo**
```
/createticket name:"WL Lottery" description:"Loteria para Whitelist - 24h" price:50 max_tickets:100 role_id:"987654321" role_name:"WL Winner" event_type:lottery max_per_user:1 auto_assign_role:true time_limit_date:"2024-01-16 20:00"
```

**Fluxo:**
1. Usuários compram tickets por 24 horas
2. Role "WL Winner" é atribuído
3. Evento expira às 20:00 e fica em pre-delete
4. Moderador faz sorteio com `/drawlottery`
5. Vencedores recebem prêmios automaticamente

### 3. **Torneio de Smash Sem Limite**
```
/createticket name:"Smash Tournament" description:"Torneio de Smash" price:25 max_tickets:32 role_id:"555666777" role_name:"Smash Player" event_type:tournament max_per_user:1 auto_assign_role:true
```

**Fluxo:**
1. Usuários se inscrevem até esgotar tickets
2. Role "Smash Player" é atribuído
3. Moderador marca como completo quando quiser
4. Pode exportar participantes ou deletar

## 📊 Funcionalidades

### ✅ **Automático**
- Atribuição de roles ao comprar
- Cálculo de prêmios para loterias
- Sorteio aleatório
- Controle de quantidade por usuário
- **Limite de tempo automático**
- **Estado pre-delete para tickets expirados**

### ✅ **Seguro**
- Verificação de $CASH suficiente
- Controle de tickets disponíveis
- Prevenção de compras duplicadas
- Backup automático de dados
- **Validação de datas**
- **Controle de expiração**
- **Sistema de delete com confirmação**

### ✅ **Flexível**
- Múltiplos tipos de evento
- Configurações personalizáveis
- Exportação de dados
- Gerenciamento completo
- **3 loterias ativas simultaneamente**
- **Exportação por ticket específico**
- **Lista interativa de tickets**
- **2 opções de delete/remoção**

## 🔧 Configurações Avançadas

### **Time Limit**
- Se `time_limit_date` for definido, ativa automaticamente
- Se não definido, não há limite de tempo
- Quando expira, ticket fica em estado "pre-delete"

### **Auto-assign Role**
- Atribui role automaticamente ao comprar
- Remove role automaticamente no delete/refund
- Padrão: true

### **Estado Pre-Delete**
- Tickets expirados ficam neste estado
- Permite apenas exportar dados ou deletar
- Não permite mais compras
- Moderadores controlam quando deletar

## 📝 Exemplos Completos

### **Loteria Simples:**
```
/createticket name:"Loteria WL" description:"Loteria para Whitelist" price:50 max_tickets:100 role_id:"123456789" role_name:"WL Winner" event_type:lottery max_per_user:1 auto_assign_role:true time_limit_date:"2024-01-20 18:00"
```

### **Torneio sem Limite:**
```
/createticket name:"Poker Tournament" description:"Torneio de Poker" price:100 max_tickets:32 role_id:"987654321" role_name:"Poker Player" event_type:poker max_per_user:1 auto_assign_role:true
```

### **Evento Custom:**
```
/createticket name:"VIP Access" description:"Acesso VIP ao servidor" price:200 max_tickets:50 role_id:"555666777" role_name:"VIP Member" event_type:custom max_per_user:1 auto_assign_role:true
``` 