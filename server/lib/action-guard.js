// ============== ACTION GUARD ==============
// Shared reentrancy protection for game socket handlers (issue #152).
//
// The casino handlers all share the same TOCTOU shape: a synchronous state
// check (games.get, round.bets.has, room.game, fs.remaining) runs BEFORE an
// awaited balance mutation, and the state write lands after it. Two quickly
// repeated events from the same player pass the check together and produce
// lost bets, double deductions or double payouts.
//
// This module unifies the two in-memory patterns already proven elsewhere
// in the codebase:
//
// 1. withActionLock — a per-key FIFO mutex, like withBalanceLock
//    (currency.js), withStockTradeLock (stock-game.js) and
//    withCompletionLock (turkish-streaks.js). Handlers move every state
//    check that used to sit before the await INTO the locked callback and
//    re-evaluate it there; a duplicate event then runs after the original
//    has fully committed and fails its own precondition cleanly.
//
// 2. claimOnce / releaseClaim — a synchronous one-shot claim on a state
//    object, like the room.game check-and-clear in brain-versus.js and the
//    cashedAt flag in crash.js. Use it for exactly-once transitions with
//    multiple entry points, where at least one entry point (e.g. the crash
//    tick loop) cannot afford to await a lock. The claim MUST be taken
//    before the caller's first await — that synchronous window is the
//    entire guarantee on a single-threaded event loop.

const actionLocks = new Map(); // key -> tail promise of the FIFO chain

// Build a lock key from a game id and its conflict scope, e.g.
// actionKey('blackjack', playerName) or actionKey('maexchen', room.code).
// One key per game + scope: every event that mutates the same round state
// must use the same key.
export function actionKey(gameId, ...parts) {
    return [gameId, ...parts].join(':');
}

// True while some callback currently holds (or waits for) the key. Handlers
// that prefer failing fast over queueing duplicate clicks can check this
// and emit an "action already in progress" error instead.
export function isActionLocked(key) {
    return actionLocks.has(key);
}

// Serialize async work per key, FIFO. Waits until every earlier holder of
// the key has fully finished (including all its awaits), then runs fn
// exclusively. Returns fn's result and rethrows fn's errors; the lock is
// always released, and the map entry is dropped once the last waiter is
// done so idle keys never accumulate.
export async function withActionLock(key, fn) {
    const prev = actionLocks.get(key) || Promise.resolve();
    let release;
    const current = new Promise(r => { release = r; });
    // The next caller must wait for everyone before us AND for us.
    const tail = prev.then(() => current);
    actionLocks.set(key, tail);
    try {
        await prev;
        return await fn();
    } finally {
        release();
        if (actionLocks.get(key) === tail) actionLocks.delete(key);
    }
}

// Synchronously claim a one-shot transition on a state object. If
// stateObj[flag] is falsy, sets it to `value` and returns true (the caller
// won the claim and may proceed); otherwise returns false. The claim lives
// on the round/bet object itself and disappears with it — nothing to clean
// up. Callers MUST invoke this before their first await.
export function claimOnce(stateObj, flag, value = true) {
    if (!stateObj || stateObj[flag]) return false;
    stateObj[flag] = value;
    return true;
}

// Undo a claim after a failed side effect, e.g. release a bet placeholder
// when the deduct was rejected. Do NOT release payout claims whose awaited
// booking threw — the booking may have gone through server-side, and a
// retry would risk paying twice; log loudly instead.
export function releaseClaim(stateObj, flag) {
    if (stateObj) stateObj[flag] = null;
}
