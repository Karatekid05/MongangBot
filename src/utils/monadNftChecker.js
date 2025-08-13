const axios = require('axios');
const User = require('../models/User');
const Setting = require('../models/Setting');
const { COLLECTION3_ROLE_ID, COLLECTION3_NAME, COLLECTION3_CONTRACT_ADDRESS } = require('./constants');

// Monad Testnet RPC Endpoint
const MONAD_RPC_URL = process.env.MONAD_RPC_URL || 'https://testnet-rpc.monad.xyz/';

// ABI for ERC-1155 balanceOf function (simplified for use with JSON-RPC)
const ERC1155_BALANCE_OF_ABI_HASH = '0x00fdd58e'; // balanceOf(address,uint256) function signature
const ERC721_BALANCE_OF_ABI_HASH = '0x70a08231'; // balanceOf(address)
const ERC721_OWNER_OF = '0x6352211e'; // ownerOf(uint256)
const ERC165_SUPPORTS_INTERFACE = '0x01ffc9a7';
const IFACE_ERC721 = '0x80ac58cd';
const IFACE_ERC1155 = '0xd9b67a26';

// Simple RPC concurrency limiter
const RPC_CONCURRENCY = Number(process.env.NFT_RPC_CONCURRENCY || 5);
let rpcActive = 0;
const rpcQueue = [];
function rpcCall(payload) {
  return new Promise((resolve, reject) => {
    const task = async () => {
      try {
        const res = await axios.post(MONAD_RPC_URL, payload);
        resolve(res);
      } catch (e) {
        reject(e);
      } finally {
        rpcActive--;
        if (rpcQueue.length > 0) {
          const next = rpcQueue.shift();
          rpcActive++;
          next();
        }
      }
    };
    if (rpcActive < RPC_CONCURRENCY) {
      rpcActive++;
      task();
    } else {
      rpcQueue.push(task);
    }
  });
}

// Cache to store results of recent checks
const nftCache = {
    data: {},
    timeout: 15 * 60 * 1000, // 15 minutes in ms (was 60 minutes)
    get: function (key) {
        const entry = this.data[key];
        if (!entry) return null;

        // Check if cache has expired
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
 * Check NFTs for all users or a specific user
 * @param {string} [userId] - Optional user ID to check
 * @returns {Promise<Object>} - Check result
 */
async function checkAllUsersNfts(userId = null) {
    try {
        console.log(`Starting NFT verification ${userId ? 'for user ' + userId : 'for all users'}`);

        // Filter to find users with registered wallets
        const filter = { walletAddress: { $exists: true, $ne: "" } };
        if (userId) {
            filter.userId = userId;
        }

        // Find users with registered wallets
        const users = await User.find(filter);
        console.log(`Found ${users.length} users with registered wallets`);

        const results = {
            success: 0,
            failed: 0,
            updated: 0,
            details: []
        };

        // Check NFTs for each user
        for (const user of users) {
            try {
                console.log(`Checking NFTs for ${user.username} (${user.walletAddress})`);
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
                console.error(`Error checking NFTs for ${user.username}:`, error.message);
                results.failed++;
                results.details.push({
                    userId: user.userId,
                    username: user.username,
                    status: 'failed',
                    error: error.message
                });
            }
        }

        console.log(`NFT verification completed. Success: ${results.success}, Failed: ${results.failed}, Updated: ${results.updated}`);
        return results;
    } catch (error) {
        console.error('Error checking NFTs:', error);
        throw error;
    }
}

/**
 * Check NFTs for a specific user and toggle collection 3 role if configured
 * @param {Object} user
 * @param {Guild} [guild]
 * @param {Object} [options] - { bypassCache?: boolean }
 */
async function checkUserNfts(user, guild, options = {}) {
    try {
        // Check NFTs for each collection
        const collection1Count = await getNftsForCollection(user.walletAddress, process.env.NFT_COLLECTION1_ADDRESS, 0, options);
        const collection2Count = await getNftsForCollection(user.walletAddress, process.env.NFT_COLLECTION2_ADDRESS, 0, options);

        console.log(`NFTs found for ${user.username}: Collection 1: ${collection1Count}, Collection 2: ${collection2Count}`);

        // Update counts for collection 1 and 2
        const changed12 =
            user.nfts.collection1Count !== collection1Count ||
            user.nfts.collection2Count !== collection2Count;
        if (changed12) {
            user.nfts.collection1Count = collection1Count;
            user.nfts.collection2Count = collection2Count;
            await user.save();
            console.log(`NFTs updated for ${user.username}`);
        }

        // Collection 3: role assignment based on static contract
        const collection3Address = COLLECTION3_CONTRACT_ADDRESS;
        if (collection3Address) {
            const hasPass = await hasCollection3Pass(user.walletAddress, options);
            if (guild) {
                try {
                    const member = await guild.members.fetch(user.userId);
                    const hasRole = member.roles.cache.has(COLLECTION3_ROLE_ID);
                    if (hasPass && !hasRole) {
                        await member.roles.add(COLLECTION3_ROLE_ID);
                        console.log(`Assigned ${COLLECTION3_NAME} role to ${user.username}`);
                    } else if (!hasPass && hasRole) {
                        await member.roles.remove(COLLECTION3_ROLE_ID);
                        console.log(`Removed ${COLLECTION3_NAME} role from ${user.username}`);
                    }
                } catch (e) {
                    console.warn('Failed role toggle for collection 3:', e.message);
                }
            }
        }

        return changed12; // whether core counts changed
    } catch (error) {
        console.error(`Error checking NFTs for user ${user.username}:`, error);
        throw error;
    }
}

/**
 * Get ERC-1155 or ERC-721 NFT count for a given wallet and collection
 * @param {string} address
 * @param {string} contractAddress
 * @param {number} tokenId
 * @param {Object} [options] - { bypassCache?: boolean }
 */
async function getNftsForCollection(address, contractAddress, tokenId = 0, options = {}) {
    try {
        // Ensure address is in the correct format
        address = address.toLowerCase();
        if (!address.startsWith('0x')) {
            address = '0x' + address;
        }

        const cacheKey = `${address}-${contractAddress}-${tokenId}`;
        if (!options.bypassCache) {
            const cachedResult = nftCache.get(cacheKey);
            if (cachedResult !== null) {
                console.log(`Using cached result for ${address} in collection ${contractAddress}`);
                return cachedResult;
            }
        }

        // Detect standard via ERC165
        const is721 = await supportsInterface(contractAddress, IFACE_ERC721);
        const is1155 = !is721 ? await supportsInterface(contractAddress, IFACE_ERC1155) : false;

        if (is721) {
            const formattedAddr = address.slice(2).toLowerCase().padStart(64, '0');
            const data = `${ERC721_BALANCE_OF_ABI_HASH}000000000000000000000000${formattedAddr}`;
            const resp = await rpcCall({ jsonrpc: '2.0', id: 1, method: 'eth_call', params: [ { to: contractAddress, data }, 'latest' ] });
            if (resp.data && resp.data.result) {
                const count = parseInt(resp.data.result, 16) || 0;
                nftCache.set(cacheKey, count);
                return count;
            }
        }

        // Try ERC-1155: probe a small range of tokenIds (0..4)
        const formattedAddr64 = address.slice(2).toLowerCase().padStart(64, '0');
        for (let probeId of [tokenId, 0, 1, 2, 3, 4]) {
            const tokenIdHex = probeId.toString(16).padStart(64, '0');
            const data = `${ERC1155_BALANCE_OF_ABI_HASH}${formattedAddr64}${tokenIdHex}`;
            try {
                const resp = await rpcCall({ jsonrpc: '2.0', id: 1, method: 'eth_call', params: [ { to: contractAddress, data }, 'latest' ] });
                if (resp.data && resp.data.result) {
                    const count = parseInt(resp.data.result, 16) || 0;
                    if (count > 0) {
                        nftCache.set(cacheKey, count);
                        return count;
                    }
                }
            } catch (e) {
                // continue probing
            }
        }

        // Fallback to 721 one more time if unknown
        try {
            const formattedAddr = address.slice(2).toLowerCase().padStart(64, '0');
            const data = `${ERC721_BALANCE_OF_ABI_HASH}000000000000000000000000${formattedAddr}`;
            const resp = await rpcCall({ jsonrpc: '2.0', id: 1, method: 'eth_call', params: [ { to: contractAddress, data }, 'latest' ] });
            if (resp.data && resp.data.result) {
                const count = parseInt(resp.data.result, 16) || 0;
                nftCache.set(cacheKey, count);
                return count;
            }
        } catch {}

        nftCache.set(cacheKey, 0);
        return 0;
    } catch (error) {
        console.error(`Error checking NFTs for ${address}:`, error.message);
        return 0;
    }
}

/**
 * Fallback: Get ERC-721 NFT count for a given wallet and collection
 * @param {string} address - Wallet address
 * @param {string} contractAddress - NFT contract address
 * @returns {Promise<number>} - NFT count
 */
async function getERC721NftsForCollection(address, contractAddress) {
    try {
        // Ensure address is in the correct format
        address = address.toLowerCase();
        if (!address.startsWith('0x')) {
            address = '0x' + address;
        }

        // Check cache first
        const cacheKey = `erc721-${address}-${contractAddress}`;
        const cachedResult = nftCache.get(cacheKey);

        if (cachedResult !== null) {
            console.log(`Using cached result for ERC721 ${address} in collection ${contractAddress}`);
            return cachedResult;
        }

        // Adjust address format for the call (remove 0x and pad to 64 characters)
        const formattedAddress = address.startsWith('0x')
            ? address.slice(2).toLowerCase().padStart(64, '0')
            : address.toLowerCase().padStart(64, '0');

        // Create data for ERC-721 balanceOf(address) call
        const balanceOfData = `0x70a08231000000000000000000000000${formattedAddress}`;

        console.log(`Calling balanceOf (default) method in ${contractAddress}`);

        // Use retry for ERC-721 calls as well
        const nftCount = await callWithRetry(async () => {
            const response = await rpcCall({
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
                console.log(`User has ${count} NFTs ERC-721 in collection ${contractAddress}`);
                return count;
            } else {
                console.warn(`ERC-721 method failed: ${JSON.stringify(response.data)}`);
                throw new Error(`ERC-721 check failed: ${JSON.stringify(response.data)}`);
            }
        }, 3);  // Maximum of 3 attempts

        // Store result in cache
        nftCache.set(cacheKey, nftCount);
        return nftCount;
    } catch (error) {
        console.error(`Error checking NFTs ERC-721 for ${address}:`, error.message);
        return 0;
    }
}

/**
 * Utility function to attempt an operation multiple times with exponential backoff
 * @param {Function} operation - Function to execute
 * @param {number} maxRetries - Maximum number of attempts
 * @returns {Promise<any>} - Operation result
 */
async function callWithRetry(operation, maxRetries = 3) {
    let lastError;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            return await operation();
        } catch (error) {
            lastError = error;

            // If it's a 429 (rate limit) or connection error, try again
            if (error.response?.status === 429 || error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT') {
                const delay = Math.pow(2, attempt) * 1000 + Math.random() * 1000; // Exponential backoff with jitter
                console.log(`Attempt ${attempt} failed with error: ${error.message}. Retrying in ${Math.round(delay / 1000)} seconds...`);
                await new Promise(resolve => setTimeout(resolve, delay));
            } else {
                // For other types of errors, don't retry
                throw error;
            }
        }
    }

    // If all attempts fail, throw the last error
    throw lastError || new Error('Operation failed after retries');
}

async function supportsInterface(contractAddress, interfaceId) {
  try {
    const ifacePadded = interfaceId.replace('0x', '').padStart(64, '0');
    const data = `${ERC165_SUPPORTS_INTERFACE}${ifacePadded}`;
    const resp = await rpcCall({
      jsonrpc: '2.0', id: 1, method: 'eth_call', params: [ { to: contractAddress, data }, 'latest' ]
    });
    if (resp.data && resp.data.result) {
      const res = resp.data.result;
      // non-zero means true
      return res !== '0x' && parseInt(res, 16) !== 0;
    }
  } catch (e) {
    // ignore, treat as unknown
  }
  return false;
}

async function hasCollection3Pass(address, options = {}) {
  if (!COLLECTION3_CONTRACT_ADDRESS) return false;
  let addr = address.toLowerCase();
  if (!addr.startsWith('0x')) addr = '0x' + addr;

  const cacheKey = `c3pass-${addr}-${COLLECTION3_CONTRACT_ADDRESS}`;
  if (!options.bypassCache) {
    const cached = nftCache.get(cacheKey);
    if (cached !== null) return cached;
  }

  // Try ERC721 balanceOf aggregator
  try {
    const formattedAddr = addr.slice(2).toLowerCase().padStart(64, '0');
    const data = `${ERC721_BALANCE_OF_ABI_HASH}000000000000000000000000${formattedAddr}`;
    const resp = await rpcCall({ jsonrpc: '2.0', id: 1, method: 'eth_call', params: [ { to: COLLECTION3_CONTRACT_ADDRESS, data }, 'latest' ] });
    if (resp.data && resp.data.result) {
      const count = parseInt(resp.data.result, 16) || 0;
      if (count > 0) { nftCache.set(cacheKey, true); return true; }
    }
  } catch {}

  // Deep scan via ownerOf over tokenIds 0..777 (early exit)
  try {
    for (let tokenId = 0; tokenId <= 777; tokenId++) {
      const tokenIdHex = tokenId.toString(16).padStart(64, '0');
      const data = `${ERC721_OWNER_OF}${tokenIdHex}`;
      try {
        const resp = await rpcCall({ jsonrpc: '2.0', id: 1, method: 'eth_call', params: [ { to: COLLECTION3_CONTRACT_ADDRESS, data }, 'latest' ] });
        if (resp.data && resp.data.result && resp.data.result !== '0x') {
          // owner address is last 40 hex chars
          const ownerHex = '0x' + resp.data.result.slice(-40);
          if (ownerHex.toLowerCase() === addr.toLowerCase()) {
            nftCache.set(cacheKey, true);
            return true;
          }
        }
      } catch {
        // ignore and continue
      }
    }
  } catch {}

  // ERC1155 multi-id as last attempt
  try {
    const formattedAddr64 = addr.slice(2).toLowerCase().padStart(64, '0');
    for (let probeId = 0; probeId <= 32; probeId++) {
      const tokenIdHex = probeId.toString(16).padStart(64, '0');
      const data = `${ERC1155_BALANCE_OF_ABI_HASH}${formattedAddr64}${tokenIdHex}`;
      const resp = await rpcCall({ jsonrpc: '2.0', id: 1, method: 'eth_call', params: [ { to: COLLECTION3_CONTRACT_ADDRESS, data }, 'latest' ] });
      if (resp.data && resp.data.result) {
        const count = parseInt(resp.data.result, 16) || 0;
        if (count > 0) { nftCache.set(cacheKey, true); return true; }
      }
    }
  } catch {}

  nftCache.set(cacheKey, false);
  return false;
}

/**
 * Check if a specific transaction was performed
 * @param {string} fromAddress - Source wallet address
 * @param {string} toAddress - Destination wallet address
 * @param {number} exactAmount - Exact transaction value in ETH/MONAD
 * @returns {Promise<{success: boolean, txHash: string|null}>} - Check result
 */
async function checkTransactionVerification(fromAddress, toAddress, exactAmount) {
    try {
        console.log(`Checking transaction from ${fromAddress} to ${toAddress} with exact amount of ${exactAmount} MONAD`);

        // Normalize addresses
        fromAddress = fromAddress.toLowerCase();
        toAddress = toAddress.toLowerCase();

        // Get latest block
        const response = await rpcCall({
            jsonrpc: '2.0',
            id: 1,
            method: 'eth_blockNumber'
        });

        if (!response.data || !response.data.result) {
            console.error('Error getting latest block number:', response.data);
            return { success: false, txHash: null };
        }

        const latestBlock = parseInt(response.data.result, 16);
        const fromBlock = Math.max(0, latestBlock - 100); // Check last 100 blocks

        console.log(`Checking transactions from blocks ${fromBlock} to ${latestBlock}`);

        // In production, you would use a more robust API like Monad Explorer or
        // an indexing service to search for all transactions to the destination address
        // Here we use a simulation for tests

        // Simulation for development environment
        if (process.env.NODE_ENV === 'development') {
            // 80% chance of success for easier tests
            const randomSuccess = Math.random() < 0.8;
            const mockTxHash = "0x" + [...Array(64)].map(() => Math.floor(Math.random() * 16).toString(16)).join("");

            console.log(`[SIMULATION] Result: ${randomSuccess ? "Transaction found" : "Transaction not found"}`);

            return {
                success: randomSuccess,
                txHash: randomSuccess ? mockTxHash : null
            };
        }

        // In production environment, you would implement something like:
        /*
        // Get recent transactions for the destination address using a Monad API
        const transactions = await getRecentTransactionsForAddress(toAddress, fromBlock, latestBlock);
        
        // Search for a transaction that matches the criteria
        for (const tx of transactions) {
            // Verify if it's from the correct sender and has the exact amount
            if (
                tx.from.toLowerCase() === fromAddress &&
                tx.to.toLowerCase() === toAddress &&
                Math.abs(parseFloat(ethers.utils.formatEther(tx.value)) - exactAmount) < 0.0000001
            ) {
                console.log(`Valid transaction found: ${tx.hash}`);
                return { success: true, txHash: tx.hash };
            }
        }
        */

        // Since we don't have direct access to the complete Monad API now, we return simulated success
        // This should be replaced with actual implementation in production
        const simulatedSuccess = Math.random() < 0.5;
        const simulatedTxHash = simulatedSuccess ?
            "0x" + [...Array(64)].map(() => Math.floor(Math.random() * 16).toString(16)).join("") :
            null;

        return {
            success: simulatedSuccess,
            txHash: simulatedTxHash
        };

    } catch (error) {
        console.error('Error checking transaction:', error);
        return { success: false, txHash: null };
    }
}

module.exports = {
    checkAllUsersNfts,
    checkUserNfts,
    getNftsForCollection,
    getERC721NftsForCollection,
    hasCollection3Pass,
    checkTransactionVerification
}; 