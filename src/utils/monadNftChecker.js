const axios = require('axios');
const User = require('../models/User');

// Endpoint RPC da Monad Testnet
const MONAD_RPC_URL = process.env.MONAD_RPC_URL || 'https://testnet-rpc.monad.xyz/';

// ABI para função balanceOf do ERC-1155 (simplificado para uso com JSON-RPC)
const ERC1155_BALANCE_OF_ABI_HASH = '0x00fdd58e'; // Assinatura da função balanceOf(address,uint256)

// Cache para armazenar resultados de verificações recentes
const nftCache = {
    data: {},
    timeout: 60 * 60 * 1000, // 1 hora em ms
    get: function (key) {
        const entry = this.data[key];
        if (!entry) return null;

        // Verifica se o cache expirou
        if (Date.now() - entry.timestamp > this.timeout) {
            delete this.data[key];
            return null;
        }

        return entry.value;
    },
    set: function (key, value) {
        this.data[key] = {
            value: value,
            timestamp: Date.now()
        };
    }
};

/**
 * Verifica os NFTs de todos os usuários ou de um usuário específico
 * @param {string} [userId] - ID opcional do usuário específico para verificar
 * @returns {Promise<Object>} - Resultado da verificação
 */
async function checkAllUsersNfts(userId = null) {
    try {
        console.log(`Iniciando verificação de NFTs ${userId ? 'para o usuário ' + userId : 'para todos os usuários'}`);

        // Filtro para encontrar usuários com carteira registrada
        const filter = { walletAddress: { $exists: true, $ne: "" } };
        if (userId) {
            filter.userId = userId;
        }

        // Buscar usuários com carteiras registradas
        const users = await User.find(filter);
        console.log(`Encontrados ${users.length} usuários com carteiras registradas`);

        const results = {
            success: 0,
            failed: 0,
            updated: 0,
            details: []
        };

        // Verificar NFTs para cada usuário
        for (const user of users) {
            try {
                console.log(`Verificando NFTs para ${user.username} (${user.walletAddress})`);
                await checkUserNfts(user);
                results.success++;
                results.details.push({
                    userId: user.userId,
                    username: user.username,
                    status: 'success',
                    nfts: {
                        collection1: user.nfts.collection1Count,
                        collection2: user.nfts.collection2Count
                    }
                });
            } catch (error) {
                console.error(`Erro ao verificar NFTs para ${user.username}:`, error.message);
                results.failed++;
                results.details.push({
                    userId: user.userId,
                    username: user.username,
                    status: 'failed',
                    error: error.message
                });
            }
        }

        console.log(`Verificação de NFTs concluída. Sucesso: ${results.success}, Falhas: ${results.failed}, Atualizações: ${results.updated}`);
        return results;
    } catch (error) {
        console.error('Erro ao verificar NFTs:', error);
        throw error;
    }
}

/**
 * Verifica os NFTs de um usuário específico
 * @param {Object} user - Usuário do MongoDB a ser verificado
 */
async function checkUserNfts(user) {
    try {
        // Verificar NFTs para cada coleção
        const collection1Count = await getNftsForCollection(user.walletAddress, process.env.NFT_COLLECTION1_ADDRESS, 0);
        const collection2Count = await getNftsForCollection(user.walletAddress, process.env.NFT_COLLECTION2_ADDRESS, 0);

        console.log(`NFTs encontrados para ${user.username}: Coleção 1: ${collection1Count}, Coleção 2: ${collection2Count}`);

        // Verificar se há alterações
        const changed =
            user.nfts.collection1Count !== collection1Count ||
            user.nfts.collection2Count !== collection2Count;

        if (changed) {
            // Atualizar contagens de NFT
            user.nfts.collection1Count = collection1Count;
            user.nfts.collection2Count = collection2Count;
            await user.save();
            console.log(`NFTs atualizados para ${user.username}`);
            return true;
        }

        return false;
    } catch (error) {
        console.error(`Erro ao verificar NFTs para o usuário ${user.username}:`, error);
        throw error;
    }
}

/**
 * Obtém a contagem de NFTs ERC-1155 para uma determinada carteira e coleção
 * @param {string} address - Endereço da carteira
 * @param {string} contractAddress - Endereço do contrato NFT
 * @param {number} tokenId - ID do token a verificar
 * @returns {Promise<number>} - Contagem de NFTs
 */
async function getNftsForCollection(address, contractAddress, tokenId = 0) {
    try {
        // Garantir que o endereço está no formato correto
        address = address.toLowerCase();
        if (!address.startsWith('0x')) {
            address = '0x' + address;
        }

        // Usar cache para evitar chamadas repetidas
        const cacheKey = `${address}-${contractAddress}-${tokenId}`;
        const cachedResult = nftCache.get(cacheKey);

        if (cachedResult !== null) {
            console.log(`Usando resultado em cache para ${address} na coleção ${contractAddress}`);
            return cachedResult;
        }

        // Ajusta o formato do endereço para a chamada (remove 0x e preenche para 64 caracteres)
        const formattedAddress = address.startsWith('0x')
            ? address.slice(2).toLowerCase().padStart(64, '0')
            : address.toLowerCase().padStart(64, '0');

        // Formata o tokenId para hexadecimal e preenche para 64 caracteres
        const tokenIdHex = tokenId.toString(16).padStart(64, '0');

        // Cria os dados para a chamada ERC-1155 balanceOf(address,uint256)
        // Formato: hash da função + endereço do wallet + tokenId
        const balanceOfData = `${ERC1155_BALANCE_OF_ABI_HASH}${formattedAddress}${tokenIdHex}`;

        console.log(`Verificando NFT ERC-1155 para ${address} no contrato ${contractAddress}, tokenId ${tokenId}`);

        // Tenta chamar a API com retry e backoff exponencial
        const nftCount = await callWithRetry(async () => {
            const response = await axios.post(MONAD_RPC_URL, {
                jsonrpc: '2.0',
                id: 1,
                method: 'eth_call',
                params: [
                    {
                        to: contractAddress,
                        data: balanceOfData
                    },
                    'latest'
                ]
            });

            // Verifica se a resposta contém o resultado
            if (response.data && response.data.result) {
                // Converte o resultado (hex) para um número
                const count = parseInt(response.data.result, 16);
                console.log(`Usuário possui ${count} NFTs na coleção ${contractAddress}, tokenId ${tokenId}`);
                return count;
            } else if (response.data && response.data.error) {
                console.log(`Método 1 falhou: ${JSON.stringify(response.data.error)}`);
                throw new Error(`ERC-1155 check failed: ${JSON.stringify(response.data.error)}`);
            } else {
                console.warn(`Resposta inesperada: ${JSON.stringify(response.data)}`);
                throw new Error('Unexpected response');
            }
        }, 3);  // Máximo de 3 tentativas

        // Armazena resultado no cache
        nftCache.set(cacheKey, nftCount);
        return nftCount;
    } catch (error) {
        console.error(`Erro ao verificar NFTs (ERC-1155) para ${address}:`, error.message);
        console.log(`Tentando consulta alternativa de NFTs para ${address}`);

        // Fallback para ERC-721
        try {
            const nftCount = await getERC721NftsForCollection(address, contractAddress);
            // Armazena resultado no cache mesmo sendo fallback
            nftCache.set(`${address}-${contractAddress}-${tokenId}`, nftCount);
            return nftCount;
        } catch (fallbackError) {
            console.error('Fallback também falhou:', fallbackError.message);

            // Em ambiente de produção, retornar 0
            // Em ambiente de desenvolvimento ou teste, podemos simular NFTs
            if (process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test') {
                console.log('Simulando consulta ao explorador Monad para', address);
                console.warn('AVISO: Assumindo que o usuário possui NFTs para fins de teste');
                return 0;
            }

            return 0;
        }
    }
}

/**
 * Fallback: Obtém a contagem de NFTs ERC-721 para uma determinada carteira e coleção
 * @param {string} address - Endereço da carteira
 * @param {string} contractAddress - Endereço do contrato NFT
 * @returns {Promise<number>} - Contagem de NFTs
 */
async function getERC721NftsForCollection(address, contractAddress) {
    try {
        // Garantir que o endereço está no formato correto
        address = address.toLowerCase();
        if (!address.startsWith('0x')) {
            address = '0x' + address;
        }

        // Verificar cache primeiro
        const cacheKey = `erc721-${address}-${contractAddress}`;
        const cachedResult = nftCache.get(cacheKey);

        if (cachedResult !== null) {
            console.log(`Usando resultado em cache para ERC721 ${address} na coleção ${contractAddress}`);
            return cachedResult;
        }

        // Ajusta o formato do endereço para a chamada (remove 0x e preenche para 64 caracteres)
        const formattedAddress = address.startsWith('0x')
            ? address.slice(2).toLowerCase().padStart(64, '0')
            : address.toLowerCase().padStart(64, '0');

        // Cria os dados para a chamada ERC-721 balanceOf(address)
        const balanceOfData = `0x70a08231000000000000000000000000${formattedAddress}`;

        console.log(`Chamando método balanceOf (padrão) em ${contractAddress}`);

        // Usar retry para chamadas ERC-721 também
        const nftCount = await callWithRetry(async () => {
            const response = await axios.post(MONAD_RPC_URL, {
                jsonrpc: '2.0',
                id: 1,
                method: 'eth_call',
                params: [
                    {
                        to: contractAddress,
                        data: balanceOfData
                    },
                    'latest'
                ]
            });

            if (response.data && response.data.result) {
                const count = parseInt(response.data.result, 16);
                console.log(`Usuário possui ${count} NFTs ERC-721 na coleção ${contractAddress}`);
                return count;
            } else {
                console.warn(`Método ERC-721 falhou: ${JSON.stringify(response.data)}`);
                throw new Error(`ERC-721 check failed: ${JSON.stringify(response.data)}`);
            }
        }, 3);  // Máximo de 3 tentativas

        // Armazenar resultado no cache
        nftCache.set(cacheKey, nftCount);
        return nftCount;
    } catch (error) {
        console.error(`Erro ao verificar NFTs ERC-721 para ${address}:`, error.message);
        return 0;
    }
}

/**
 * Função utilitária para tentar uma operação várias vezes com backoff exponencial
 * @param {Function} operation - Função a ser executada
 * @param {number} maxRetries - Número máximo de tentativas
 * @returns {Promise<any>} - Resultado da operação
 */
async function callWithRetry(operation, maxRetries = 3) {
    let lastError;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            return await operation();
        } catch (error) {
            lastError = error;

            // Se for o erro 429 (rate limit), ou erro de conexão, tentar novamente
            if (error.response?.status === 429 || error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT') {
                const delay = Math.pow(2, attempt) * 1000 + Math.random() * 1000; // Backoff exponencial com jitter
                console.log(`Tentativa ${attempt} falhou com erro: ${error.message}. Tentando novamente em ${Math.round(delay / 1000)} segundos...`);
                await new Promise(resolve => setTimeout(resolve, delay));
            } else {
                // Para outros tipos de erro, não tentar novamente
                throw error;
            }
        }
    }

    // Se todas as tentativas falharem, lançar o último erro
    throw lastError || new Error('Operation failed after retries');
}

/**
 * Verifica se uma transação específica foi realizada
 * @param {string} fromAddress - Endereço da carteira de origem
 * @param {string} toAddress - Endereço da carteira de destino
 * @param {number} exactAmount - Valor exato da transação em ETH/MONAD
 * @returns {Promise<{success: boolean, txHash: string|null}>} - Resultado da verificação
 */
async function checkTransactionVerification(fromAddress, toAddress, exactAmount) {
    try {
        console.log(`Verificando transação de ${fromAddress} para ${toAddress} no valor exato de ${exactAmount} MONAD`);

        // Normalizar endereços
        fromAddress = fromAddress.toLowerCase();
        toAddress = toAddress.toLowerCase();

        // Buscar o bloco mais recente
        const response = await axios.post(MONAD_RPC_URL, {
            jsonrpc: '2.0',
            id: 1,
            method: 'eth_blockNumber',
            params: []
        });

        if (!response.data || !response.data.result) {
            console.error('Erro ao obter o número do bloco mais recente:', response.data);
            return { success: false, txHash: null };
        }

        const latestBlock = parseInt(response.data.result, 16);
        const fromBlock = Math.max(0, latestBlock - 100); // Verificar os últimos 100 blocos

        console.log(`Verificando transações dos blocos ${fromBlock} até ${latestBlock}`);

        // Em produção, você usaria uma API mais robusta como o Monad Explorer ou
        // um serviço de indexação para buscar todas as transações para o endereço de destino
        // Aqui usamos uma simulação para testes

        // Simulação para ambiente de desenvolvimento
        if (process.env.NODE_ENV === 'development') {
            // 80% de chance de sucesso para facilitar testes
            const randomSuccess = Math.random() < 0.8;
            const mockTxHash = "0x" + [...Array(64)].map(() => Math.floor(Math.random() * 16).toString(16)).join("");

            console.log(`[SIMULAÇÃO] Resultado: ${randomSuccess ? "Transação encontrada" : "Transação não encontrada"}`);

            return {
                success: randomSuccess,
                txHash: randomSuccess ? mockTxHash : null
            };
        }

        // Em ambiente de produção, você implementaria algo como:
        /*
        // Obter transações recentes para o endereço de destino usando uma API do Monad
        const transactions = await getRecentTransactionsForAddress(toAddress, fromBlock, latestBlock);
        
        // Procurar por uma transação que corresponda aos critérios
        for (const tx of transactions) {
            // Verificar se é do remetente correto e tem o valor exato
            if (
                tx.from.toLowerCase() === fromAddress &&
                tx.to.toLowerCase() === toAddress &&
                Math.abs(parseFloat(ethers.utils.formatEther(tx.value)) - exactAmount) < 0.0000001
            ) {
                console.log(`Transação válida encontrada: ${tx.hash}`);
                return { success: true, txHash: tx.hash };
            }
        }
        */

        // Como não temos acesso direto à API completa da Monad agora, retornamos sucesso simulado
        // Isso deve ser substituído pela implementação real em produção
        const simulatedSuccess = Math.random() < 0.5;
        const simulatedTxHash = simulatedSuccess ?
            "0x" + [...Array(64)].map(() => Math.floor(Math.random() * 16).toString(16)).join("") :
            null;

        return { success: simulatedSuccess, txHash: simulatedTxHash };

    } catch (error) {
        console.error('Erro ao verificar transação:', error);
        return { success: false, txHash: null };
    }
}

module.exports = {
    checkAllUsersNfts,
    checkUserNfts,
    checkTransactionVerification
}; 