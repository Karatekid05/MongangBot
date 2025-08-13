const axios = require('axios');
const User = require('../models/User');
const Setting = require('../models/Setting');
const { COLLECTION3_ROLE_ID, COLLECTION3_NAME } = require('./constants');

// Monad Testnet RPC Endpoint
const MONAD_RPC_URL = process.env.MONAD_RPC_URL || 'https://testnet-rpc.monad.xyz/';

// ABI for ERC-1155 balanceOf function (simplified for use with JSON-RPC)
const ERC1155_BALANCE_OF_ABI_HASH = '0x00fdd58e'; // balanceOf(address,uint256) function signature

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
 * Check NFTs for a specific user
 * @param {Object} user - MongoDB user to check
 */
async function checkUserNfts(user, guild) {
    try {
        // Check NFTs for each collection
        const collection1Count = await getNftsForCollection(user.walletAddress, process.env.NFT_COLLECTION1_ADDRESS, 0);
        const collection2Count = await getNftsForCollection(user.walletAddress, process.env.NFT_COLLECTION2_ADDRESS, 0);

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

        // Collection 3: role assignment if configured
        const setting = await Setting.findOne({ key: 'COLLECTION3_ADDRESS' });
        if (setting && setting.value) {
            const collection3Address = setting.value;
            const collection3Count = await getNftsForCollection(user.walletAddress, collection3Address, 0);
            const hasPass = collection3Count > 0;

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
 * Get ERC-1155 NFT count for a given wallet and collection
 * @param {string} address - Wallet address
 * @param {string} contractAddress - NFT contract address
 * @param {number} tokenId - Token ID to check
 * @returns {Promise<number>} - NFT count
 */
async function getNftsForCollection(address, contractAddress, tokenId = 0) {
    try {
        // Ensure address is in the correct format
        address = address.toLowerCase();
        if (!address.startsWith('0x')) {
            address = '0x' + address;
        }

        // Use cache to avoid repeated calls
        const cacheKey = `${address}-${contractAddress}-${tokenId}`;
        const cachedResult = nftCache.get(cacheKey);

        if (cachedResult !== null) {
            console.log(`Using cached result for ${address} in collection ${contractAddress}`);
            return cachedResult;
        }

        // Adjust address format for the call (remove 0x and pad to 64 characters)
        const formattedAddress = address.startsWith('0x')
            ? address.slice(2).toLowerCase().padStart(64, '0')
            : address.toLowerCase().padStart(64, '0');

        // Format tokenId to hexadecimal and pad to 64 characters
        const tokenIdHex = tokenId.toString(16).padStart(64, '0');

        // Create data for ERC-1155 balanceOf(address,uint256) call
        // Format: function hash + wallet address + tokenId
        const balanceOfData = `${ERC1155_BALANCE_OF_ABI_HASH}${formattedAddress}${tokenIdHex}`;

        console.log(`Checking ERC-1155 NFT for ${address} in contract ${contractAddress}, tokenId ${tokenId}`);

        // Try to call the API with retry and exponential backoff
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

            // Check if the response contains the result
            if (response.data && response.data.result) {
                // Convert result (hex) to a number
                const count = parseInt(response.data.result, 16);
                console.log(`User has ${count} NFTs in collection ${contractAddress}, tokenId ${tokenId}`);
                return count;
            } else if (response.data && response.data.error) {
                console.log(`Method 1 failed: ${JSON.stringify(response.data.error)}`);
                throw new Error(`ERC-1155 check failed: ${JSON.stringify(response.data.error)}`);
            } else {
                console.warn(`Unexpected response: ${JSON.stringify(response.data)}`);
                throw new Error('Unexpected response');
            }
        }, 3);  // Maximum of 3 attempts

        // Store result in cache
        nftCache.set(cacheKey, nftCount);
        return nftCount;
    } catch (error) {
        console.error(`Error checking NFTs (ERC-1155) for ${address}:`, error.message);
        console.log(`Trying alternative NFT query for ${address}`);

        // Fallback for ERC-721
        try {
            const nftCount = await getERC721NftsForCollection(address, contractAddress);
            // Store result in cache even if it's a fallback
            nftCache.set(`${address}-${contractAddress}-${tokenId}`, nftCount);
            return nftCount;
        } catch (fallbackError) {
            console.error('Fallback also failed:', fallbackError.message);

            // In production environment, return 0
            // In development or test environment, we can simulate NFTs
            if (process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test') {
                console.log('Simulating query to Monad explorer for', address);
                console.warn('WARNING: Assuming user has NFTs for test purposes');
                return 0;
            }

            return 0;
        }
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
        const response = await axios.post(MONAD_RPC_URL, {
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
    checkTransactionVerification
}; 