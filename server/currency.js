// ============== CURRENCY MANAGEMENT ==============

import { isDatabaseEnabled, query, withTransaction } from './db.js';

const STARTING_BALANCE = 1000;

// Fallback in-memory storage for local development without DATABASE_URL
const balances = new Map(); // playerName -> number
const diamonds = new Map(); // playerName -> number

// Simple lock mechanism for in-memory operations to prevent race conditions
const balanceLocks = new Map(); // playerName -> Promise

async function withBalanceLock(playerName, fn) {
    // Wait for any existing lock on this player
    while (balanceLocks.has(playerName)) {
        await balanceLocks.get(playerName);
    }

    // Create our lock
    let resolve;
    const lockPromise = new Promise(r => { resolve = r; });
    balanceLocks.set(playerName, lockPromise);

    try {
        return await fn();
    } finally {
        balanceLocks.delete(playerName);
        resolve();
    }
}

function isValidAmount(amount) {
    return typeof amount === 'number' && Number.isFinite(amount) && amount > 0;
}

function normalizeMoney(amount) {
    return Math.round(amount * 100) / 100;
}

async function getBalanceMemory(playerName) {
    if (!balances.has(playerName)) {
        balances.set(playerName, STARTING_BALANCE);
    }
    return balances.get(playerName);
}

async function getOrCreatePlayerBalance(playerName, client = null) {
    const runner = client || { query };

    await runner.query(
        `insert into players (name, balance)
         values ($1, $2)
         on conflict (name) do nothing`,
        [playerName, STARTING_BALANCE]
    );

    const result = await runner.query(
        'select balance from players where name = $1 limit 1',
        [playerName]
    );

    if (!result.rows[0]) return STARTING_BALANCE;
    return Number(result.rows[0].balance);
}

/**
 * Returns true if this is the player's first time being registered (no row
 * existed before). Used by the activity feed to welcome new arrivals.
 *
 * Memory-mode: reports "new" when we haven't seen the name yet this process —
 * good enough for dev/test, since memory mode loses state on restart anyway.
 */
const memorySeenPlayers = new Set();
export async function isNewPlayer(playerName) {
    if (!isDatabaseEnabled()) {
        if (memorySeenPlayers.has(playerName)) return false;
        memorySeenPlayers.add(playerName);
        return true;
    }
    const result = await query(
        'select 1 from players where name = $1 limit 1',
        [playerName]
    );
    return result.rowCount === 0;
}

export async function getBalance(playerName, client = null) {
    if (!isDatabaseEnabled()) {
        return getBalanceMemory(playerName);
    }
    return getOrCreatePlayerBalance(playerName, client);
}

export async function addBalance(playerName, amount, reason = 'adjustment', metadata = null, client = null) {
    if (!isValidAmount(amount)) return null;
    amount = normalizeMoney(amount);

    if (!isDatabaseEnabled()) {
        const current = await getBalanceMemory(playerName);
        const newBalance = normalizeMoney(current + amount);
        balances.set(playerName, newBalance);
        maybeAnnounceBalanceMilestone(playerName, current, newBalance);
        return newBalance;
    }

    // When no external client is provided, wrap in a transaction so
    // balance update + ledger insert are atomic.
    if (!client) {
        return withTransaction(async (txClient) => {
            return _addBalanceDB(playerName, amount, reason, metadata, txClient);
        });
    }
    return _addBalanceDB(playerName, amount, reason, metadata, client);
}

async function _addBalanceDB(playerName, amount, reason, metadata, client) {
    await getOrCreatePlayerBalance(playerName, client);

    // Read prior balance so callers can detect milestone crossings (e.g. for
    // the activity feed). Cheap inside the same transaction.
    const before = await client.query(
        'select balance from players where name = $1 limit 1',
        [playerName]
    );
    const previousBalance = before.rows[0] ? Number(before.rows[0].balance) : 0;

    const updated = await client.query(
        'update players set balance = round((balance + $1)::numeric, 2), updated_at = now() where name = $2 returning id, balance',
        [amount, playerName]
    );

    const row = updated.rows[0];
    if (!row) return null;

    await client.query(
        `insert into wallet_ledger (player_id, delta, reason, metadata)
         values ($1, $2, $3, $4)`,
        [row.id, amount, reason, metadata]
    );

    const newBalance = Number(row.balance);
    maybeAnnounceBalanceMilestone(playerName, previousBalance, newBalance);
    return newBalance;
}

const BALANCE_MILESTONES = [10000, 25000, 50000, 100000, 250000, 500000, 1000000];
function maybeAnnounceBalanceMilestone(playerName, prev, next) {
    if (!Number.isFinite(prev) || !Number.isFinite(next) || next <= prev) return;
    for (const m of BALANCE_MILESTONES) {
        if (prev < m && next >= m) {
            // Lazy import to avoid a circular dep between currency and the feed.
            import('./activity-feed.js').then(({ pushActivity }) => {
                pushActivity({
                    type: 'balance_milestone', player: playerName,
                    text: `Crossed ${m.toLocaleString('en-US')} SC in their wallet`,
                    icon: m >= 100000 ? '💰' : '🪙',
                    color: m >= 100000 ? 'magenta' : 'gold',
                    meta: { milestone: m, balance: next }
                });
            }).catch(() => {});
            break; // Only announce the highest crossed in one call.
        }
    }
}

export async function deductBalance(playerName, amount, reason = 'adjustment', metadata = null, client = null) {
    if (!isValidAmount(amount)) return null;
    amount = normalizeMoney(amount);

    if (!isDatabaseEnabled()) {
        // Use lock to prevent race conditions in concurrent deductions
        return withBalanceLock(playerName, async () => {
            const current = await getBalanceMemory(playerName);
            if (amount > current) return null;
            const newBalance = normalizeMoney(current - amount);
            balances.set(playerName, newBalance);
            return newBalance;
        });
    }

    // When no external client is provided, wrap in a transaction so
    // balance update + ledger insert are atomic.
    if (!client) {
        return withTransaction(async (txClient) => {
            return _deductBalanceDB(playerName, amount, reason, metadata, txClient);
        });
    }
    return _deductBalanceDB(playerName, amount, reason, metadata, client);
}

async function _deductBalanceDB(playerName, amount, reason, metadata, client) {
    await getOrCreatePlayerBalance(playerName, client);

    const updated = await client.query(
        `update players
         set balance = round((balance - $1)::numeric, 2), updated_at = now()
         where name = $2 and balance >= $1
         returning id, balance`,
        [amount, playerName]
    );

    const row = updated.rows[0];
    if (!row) return null;

    await client.query(
        `insert into wallet_ledger (player_id, delta, reason, metadata)
         values ($1, $2, $3, $4)`,
        [row.id, -amount, reason, metadata]
    );

    return Number(row.balance);
}

export function getAllPlayerNamesMemory() {
    return Array.from(balances.keys());
}

// ============== DIAMOND MANAGEMENT ==============

async function getDiamondsMemory(playerName) {
    return diamonds.get(playerName) || 0;
}

export async function getDiamonds(playerName) {
    if (!isDatabaseEnabled()) {
        return getDiamondsMemory(playerName);
    }

    await getOrCreatePlayerBalance(playerName);
    const result = await query(
        'select diamonds from players where name = $1',
        [playerName]
    );
    return result.rows[0]?.diamonds || 0;
}

export async function buyDiamonds(playerName, count = 1) {
    if (!Number.isInteger(count) || count <= 0) return null;
    
    const cost = 25 * count;

    if (!isDatabaseEnabled()) {
        const currentBalance = await getBalanceMemory(playerName);
        if (cost > currentBalance) return null;
        
        const newBalance = normalizeMoney(currentBalance - cost);
        balances.set(playerName, newBalance);
        
        const currentDiamonds = diamonds.get(playerName) || 0;
        const newDiamonds = currentDiamonds + count;
        diamonds.set(playerName, newDiamonds);
        
        return {
            balance: newBalance,
            diamonds: newDiamonds
        };
    }

    return withTransaction(async (txClient) => {
        // Deduct coins
        const newBalance = await _deductBalanceDB(playerName, cost, 'diamond_purchase', { count }, txClient);
        if (newBalance === null) return null;
        
        // Add diamonds
        const result = await txClient.query(
            'update players set diamonds = diamonds + $1 where name = $2 returning diamonds',
            [count, playerName]
        );
        
        return {
            balance: newBalance,
            diamonds: result.rows[0]?.diamonds || 0
        };
    });
}

// Grant diamonds for free (rewards, streaks, achievements). Returns the new
// diamond count, or null on failure. No coins are deducted.
export async function addDiamonds(playerName, count = 1, reason = 'reward', metadata = null) {
    if (!Number.isInteger(count) || count <= 0) return null;
    if (!isDatabaseEnabled()) {
        return await withBalanceLock(playerName, async () => {
            const current = diamonds.get(playerName) || 0;
            const next = current + count;
            diamonds.set(playerName, next);
            return next;
        });
    }
    return withTransaction(async (txClient) => {
        await getOrCreatePlayerBalance(playerName, txClient);
        const result = await txClient.query(
            'update players set diamonds = diamonds + $1 where name = $2 returning diamonds',
            [count, playerName]
        );
        // Log to ledger as well so the wallet ledger reflects the grant.
        await txClient.query(
            `insert into wallet_ledger (player_id, delta, reason, metadata)
             select id, 0, $2, $3 from players where name = $1`,
            [playerName, reason, JSON.stringify({ diamonds: count, ...(metadata || {}) })]
        );
        return result.rows[0]?.diamonds || 0;
    });
}

export { STARTING_BALANCE };
