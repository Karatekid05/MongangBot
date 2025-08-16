#!/usr/bin/env node
/*
 * Simulate a full scan of wallets to check HaHa x MonGang Pass ownership
 * WITHOUT modifying any Discord roles or user data.
 * Logs one line per user with the result.
 */

require('dotenv').config();
const mongoose = require('mongoose');

const User = require('../src/models/User');
const { hasCollection3Pass } = require('../src/utils/monadNftChecker');

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function pMapWithConcurrency(items, mapper, concurrency) {
  const results = new Array(items.length);
  let next = 0;
  const workers = new Array(Math.max(1, concurrency)).fill(null).map(async () => {
    while (true) {
      const idx = next++;
      if (idx >= items.length) break;
      results[idx] = await mapper(items[idx], idx);
    }
  });
  await Promise.all(workers);
  return results;
}

async function main() {
  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) {
    console.error('Missing MONGODB_URI in .env');
    process.exit(1);
  }

  const parallel = Number(process.env.SIM_PASS_PARALLEL || 4);
  const batchSize = Number(process.env.SIM_PASS_BATCH_SIZE || 100);
  const batchDelayMs = Number(process.env.SIM_PASS_BATCH_DELAY_MS || 1000);

  await mongoose.connect(mongoUri);
  console.log('Connected to MongoDB');

  const users = await User.find({ walletAddress: { $exists: true, $ne: '' } });
  console.log(`Found ${users.length} users with wallets. Starting simulation (no role changes)...`);

  let hasPassCount = 0;
  let noPassCount = 0;
  let errorCount = 0;

  for (let start = 0; start < users.length; start += batchSize) {
    const batch = users.slice(start, start + batchSize);
    console.log(`\nBatch ${Math.floor(start / batchSize) + 1} — ${batch.length} users`);

    await pMapWithConcurrency(batch, async (user) => {
      const addr = (user.walletAddress || '').toLowerCase();
      if (!addr) return;
      try {
        const hasPass = await hasCollection3Pass(addr, { allowDeepScan: true, bypassCache: false });
        if (hasPass) {
          hasPassCount++;
        } else {
          noPassCount++;
        }
        console.log(`[PASS-CHECK] userId=${user.userId} username="${user.username}" wallet=${addr} -> ${hasPass ? 'HAS_PASS' : 'NO_PASS'}`);
      } catch (e) {
        errorCount++;
        console.log(`[PASS-CHECK] userId=${user.userId} username="${user.username}" wallet=${addr} -> ERROR: ${e.message}`);
      }
    }, parallel);

    if (start + batchSize < users.length) {
      await sleep(batchDelayMs);
    }
  }

  console.log(`\nSimulation completed. HAS_PASS=${hasPassCount}, NO_PASS=${noPassCount}, ERRORS=${errorCount}`);
  await mongoose.disconnect();
}

main().catch(async (e) => {
  console.error('Fatal error in simulation:', e);
  try { await mongoose.disconnect(); } catch {}
  process.exit(1);
});


