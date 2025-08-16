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

// Simple RPC concurrency limiter + per-second rate limiter to avoid 429s
const RPC_CONCURRENCY = Number(process.env.NFT_RPC_CONCURRENCY || 5);
const RPC_RPS_LIMIT = Number(process.env.NFT_RPC_RPS_LIMIT || 20); // keep well under 25/sec

// Batching controls to smooth account-level throughput on provider
const CHECK_BATCH_SIZE = Number(process.env.NFT_CHECK_BATCH_SIZE || 50);
const CHECK_BATCH_DELAY_MS = Number(process.env.NFT_CHECK_BATCH_DELAY_MS || 1500);
const CHECK_PARALLEL = Number(process.env.NFT_CHECK_PARALLEL || 4);

// TTLs to reduce repeated checks (tunable via env)
const C12_TTL_MS = Number(process.env.NFT_C12_TTL_MS || 24 * 60 * 60 * 1000); // 24h
const C3_TTL_MS = Number(process.env.NFT_C3_TTL_MS || 24 * 60 * 60 * 1000);   // 24h
const C3_DEEP_TTL_MS = Number(process.env.NFT_C3_DEEP_TTL_MS || 24 * 60 * 60 * 1000); // 24h

let rpcActive = 0;
const rpcQueue = [];

let rateTokens = RPC_RPS_LIMIT;
let lastRefillMs = Date.now();

function refillRateTokens() {
  const now = Date.now();
  if (now - lastRefillMs >= 1000) {
    rateTokens = RPC_RPS_LIMIT;
    lastRefillMs = now;
  }
}

async function waitForRateToken() {
  // Busy-wait with small sleeps until a token is available
  // Keeps total requests <= RPC_RPS_LIMIT per second across the process
  // Also handles dynamic refills each second
  // We keep the sleep short to not add too much latency
  // This is simple and robust enough for our use case
  // If RPC_RPS_LIMIT is 0 or negative, default to 10
  const effectiveLimit = RPC_RPS_LIMIT > 0 ? RPC_RPS_LIMIT : 10;
  while (true) {
    refillRateTokens();
    if (rateTokens > 0) {
      rateTokens--;
      return;
    }
    const timeToNextSecond = Math.max(10, 1000 - (Date.now() - lastRefillMs));
    await new Promise(resolve => setTimeout(resolve, Math.min(50, timeToNextSecond)));
  }
}

function rpcCall(payload) {
  return new Promise((resolve, reject) => {
    const task = async () => {
      try {
        await waitForRateToken();
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

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function pMapWithConcurrency(items, mapper, concurrency) {
    const results = new Array(items.length);
    let nextIndex = 0;
    const workers = new Array(Math.max(1, concurrency)).fill(null).map(async () => {
        while (true) {
            const current = nextIndex++;
            if (current >= items.length) break;
            results[current] = await mapper(items[current], current);
        }
    });
    await Promise.all(workers);
    return results;
}

// Cache to store results of recent checks
const nftCache = {
    data: {},
    timeout: 60 * 60 * 1000, // 60 minutes in ms
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

        // Process in batches to smooth provider throughput
        for (let start = 0; start < users.length; start += CHECK_BATCH_SIZE) {
            const batch = users.slice(start, start + CHECK_BATCH_SIZE);
            console.log(`Processing NFT checks batch ${Math.floor(start / CHECK_BATCH_SIZE) + 1} (${batch.length} users)`);

            await pMapWithConcurrency(batch, async (user) => {
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
            }, CHECK_PARALLEL);

            // Pause between batches to avoid CU/s spikes
            if (start + CHECK_BATCH_SIZE < users.length) {
                await sleep(CHECK_BATCH_DELAY_MS);
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
        const now = Date.now();

        // Check NFTs for each collection (1/2) with TTL gating
        let collection1Count = user.nfts.collection1Count || 0;
        let collection2Count = user.nfts.collection2Count || 0;

        const shouldRefreshC12 = !user.nftsLastCheckedAt || (now - new Date(user.nftsLastCheckedAt).getTime() > C12_TTL_MS) || options.forceRefresh;
        if (shouldRefreshC12) {
            collection1Count = await getNftsForCollection(user.walletAddress, process.env.NFT_COLLECTION1_ADDRESS, 0, options);
            collection2Count = await getNftsForCollection(user.walletAddress, process.env.NFT_COLLECTION2_ADDRESS, 0, options);
        }

        console.log(`NFTs found for ${user.username}: Collection 1: ${collection1Count}, Collection 2: ${collection2Count}`);

        // Update counts for collection 1 and 2
        const changed12 =
            user.nfts.collection1Count !== collection1Count ||
            user.nfts.collection2Count !== collection2Count;
        if (changed12 || shouldRefreshC12) {
            user.nfts.collection1Count = collection1Count;
            user.nfts.collection2Count = collection2Count;
            user.nftsLastCheckedAt = new Date(now);
            await user.save();
            console.log(`NFTs updated for ${user.username}`);
        }

        // Collection 3: role assignment based on static contract
        const collection3Address = COLLECTION3_CONTRACT_ADDRESS;
        if (collection3Address) {
            let hasRoleExisting = false;
            let member = null;
            if (guild) {
                try {
                    member = await guild.members.fetch(user.userId);
                    hasRoleExisting = member.roles.cache.has(COLLECTION3_ROLE_ID);
                } catch (e) {
                    // If we can't fetch the member, skip role toggling entirely
                    console.warn('Failed to fetch guild member for role toggle:', e.message);
                }
            }

            // TTL gating for collection 3
            let hasPass = hasRoleExisting;
            const c3Fresh = user.c3LastCheckedAt && (now - new Date(user.c3LastCheckedAt).getTime() <= C3_TTL_MS);
            if (!c3Fresh || options.forceRefresh) {
                const deepFresh = user.c3LastDeepScanAt && (now - new Date(user.c3LastDeepScanAt).getTime() <= C3_DEEP_TTL_MS);
                const allowDeepScan = options.allowDeepScan !== false && !deepFresh;

                hasPass = await hasCollection3Pass(
                    user.walletAddress,
                    { ...options, existingHasRole: hasRoleExisting, allowDeepScan }
                );

                // Update timestamps
                user.c3LastCheckedAt = new Date(now);
                if (allowDeepScan) {
                    user.c3LastDeepScanAt = new Date(now);
                }
                await user.save().catch(() => {});
            }

            if (member) {
                try {
                    const hasRoleAfterFetch = member.roles.cache.has(COLLECTION3_ROLE_ID);
                    if (hasPass && !hasRoleAfterFetch) {
                        await member.roles.add(COLLECTION3_ROLE_ID);
                        console.log(`Assigned ${COLLECTION3_NAME} role to ${user.username}`);
                    } else if (!hasPass && hasRoleAfterFetch) {
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

  const keepRoleIfUnknown = Boolean(options.existingHasRole);
  let anySuccessful = false;

  // Try ERC721 balanceOf aggregator (with retry)
  try {
    const formattedAddr = addr.slice(2).toLowerCase().padStart(64, '0');
    const data = `${ERC721_BALANCE_OF_ABI_HASH}000000000000000000000000${formattedAddr}`;
    const resp = await callWithRetry(async () =>
      rpcCall({ jsonrpc: '2.0', id: 1, method: 'eth_call', params: [ { to: COLLECTION3_CONTRACT_ADDRESS, data }, 'latest' ] })
    );
    if (resp.data && resp.data.result) {
      anySuccessful = true;
      const count = parseInt(resp.data.result, 16) || 0;
      if (count > 0) { nftCache.set(cacheKey, true); return true; }
    }
  } catch {}

  // Optionally perform deep/expensive scans only if allowed
  const allowDeepScan = options.allowDeepScan !== false;
  if (allowDeepScan) {
    // Deep scan via ownerOf over tokenIds 0..777 (early exit)
    try {
      for (let tokenId = 0; tokenId <= 777; tokenId++) {
        const tokenIdHex = tokenId.toString(16).padStart(64, '0');
        const data = `${ERC721_OWNER_OF}${tokenIdHex}`;
        try {
          const resp = await callWithRetry(async () =>
            rpcCall({ jsonrpc: '2.0', id: 1, method: 'eth_call', params: [ { to: COLLECTION3_CONTRACT_ADDRESS, data }, 'latest' ] })
          );
          if (resp.data && resp.data.result) {
            anySuccessful = true;
          }
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
        const resp = await callWithRetry(async () =>
          rpcCall({ jsonrpc: '2.0', id: 1, method: 'eth_call', params: [ { to: COLLECTION3_CONTRACT_ADDRESS, data }, 'latest' ] })
        );
        if (resp.data && resp.data.result) {
          anySuccessful = true;
          const count = parseInt(resp.data.result, 16) || 0;
          if (count > 0) { nftCache.set(cacheKey, true); return true; }
        }
      }
    } catch {}
  }

  // If we never had a successful RPC response, keep current role state to avoid flapping
  if (!anySuccessful) {
    return keepRoleIfUnknown;
  }

  // Definitive negative (we had successful responses but found no ownership)
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

        // Compute expected amount in micro-MON (6 decimals) to avoid float errors
        const expectedMicro = Math.round(Number(exactAmount) * 1e6);
        const WEI_PER_MICRO = 10n ** 12n; // 1e12 wei = 1 micro-MON

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
        const lookback = Number(process.env.VERIFICATION_BLOCK_LOOKBACK || 5000);
        const scanCap = Number(process.env.VERIFICATION_SCAN_BLOCKS_PER_ATTEMPT || 800);
        const range = Math.min(lookback, scanCap);
        const startBlock = Math.max(0, latestBlock - range);
        console.log(`Checking transactions from blocks ${startBlock} to ${latestBlock}`);

        for (let blockNum = latestBlock; blockNum >= startBlock; blockNum--) {
                const blockTag = '0x' + blockNum.toString(16);
                try {
                    const blockRes = await rpcCall({
                        jsonrpc: '2.0',
                        id: 1,
                        method: 'eth_getBlockByNumber',
                        params: [blockTag, true]
                    });
                    const block = blockRes.data && blockRes.data.result;
                    if (!block || !Array.isArray(block.transactions)) continue;

                    for (const tx of block.transactions) {
                        if (!tx || !tx.to) continue;
                        if (tx.to.toLowerCase() !== toAddress) continue;
                        if ((tx.from || '').toLowerCase() !== fromAddress) continue;
                        if (!tx.value) continue;

                        // Compare by micro-MON units
                        const wei = BigInt(tx.value);
                        const micro = Number(wei / WEI_PER_MICRO);
                        if (micro === expectedMicro) {
                            console.log(`Valid transaction found in block ${blockNum}: ${tx.hash}`);
                            return { success: true, txHash: tx.hash };
                        }
                    }
                } catch (e) {
                    // continue scanning on transient errors
                }
        }

        return { success: false, txHash: null };
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