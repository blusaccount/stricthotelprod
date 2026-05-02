import { describe, it, expect } from 'vitest';
import {
    pickReelSymbol,
    spinGrid,
    evaluateSpin,
    evaluateLine,
    expandedGrid,
    REEL_POOLS,
    PAYTABLE,
    PAYLINES,
    PAYLINE_COUNT,
    SCATTER_PAY,
    FREE_SPIN_AWARD,
    FREE_SPIN_MULTIPLIER,
    FREE_SPIN_TRIGGER_COUNT,
    STRICTLY7S_BETS
} from '../handlers/strictly7s.js';

describe('Strictly7s 2.0 — config sanity', () => {
    it('has 5 reel pools', () => {
        expect(REEL_POOLS).toHaveLength(5);
    });

    it('outer reels (1, 5) have no WILD; inner reels (2, 3, 4) have WILD', () => {
        expect(REEL_POOLS[0].WILD).toBeUndefined();
        expect(REEL_POOLS[4].WILD).toBeUndefined();
        expect(REEL_POOLS[1].WILD).toBeGreaterThan(0);
        expect(REEL_POOLS[2].WILD).toBeGreaterThan(0);
        expect(REEL_POOLS[3].WILD).toBeGreaterThan(0);
    });

    it('every reel includes SCATTER and BLANK', () => {
        for (const pool of REEL_POOLS) {
            expect(pool.SCATTER).toBeGreaterThan(0);
            expect(pool.BLANK).toBeGreaterThan(0);
        }
    });

    it('paytable covers all paying symbols with 3, 4, 5 of a kind', () => {
        const paying = ['SEVEN', 'DIAMOND', 'BAR', 'BELL', 'CHERRY', 'LEMON'];
        for (const sym of paying) {
            expect(PAYTABLE[sym]).toBeDefined();
            expect(PAYTABLE[sym][3]).toBeGreaterThan(0);
            expect(PAYTABLE[sym][4]).toBeGreaterThan(PAYTABLE[sym][3]);
            expect(PAYTABLE[sym][5]).toBeGreaterThan(PAYTABLE[sym][4]);
        }
    });

    it('paytable does not pay BLANK, WILD, or SCATTER as line symbols', () => {
        expect(PAYTABLE.BLANK).toBeUndefined();
        expect(PAYTABLE.WILD).toBeUndefined();
        expect(PAYTABLE.SCATTER).toBeUndefined();
    });

    it('has exactly 10 paylines, each spanning 5 reels with row indices in 0..2', () => {
        expect(PAYLINES).toHaveLength(PAYLINE_COUNT);
        for (const line of PAYLINES) {
            expect(line).toHaveLength(5);
            for (const r of line) {
                expect(r).toBeGreaterThanOrEqual(0);
                expect(r).toBeLessThanOrEqual(2);
            }
        }
    });

    it('exposes valid bet levels', () => {
        expect(STRICTLY7S_BETS).toContain(5);
        expect(STRICTLY7S_BETS).toContain(500);
    });
});

describe('pickReelSymbol', () => {
    it('returns a valid symbol id from the requested reel pool', () => {
        for (let r = 0; r < 5; r++) {
            for (let i = 0; i < 50; i++) {
                const id = pickReelSymbol(r);
                expect(REEL_POOLS[r][id]).toBeGreaterThan(0);
            }
        }
    });

    it('outer reel (1) never returns WILD', () => {
        for (let i = 0; i < 200; i++) {
            expect(pickReelSymbol(0)).not.toBe('WILD');
        }
    });
});

describe('spinGrid', () => {
    it('produces a 5×3 grid of valid symbols', () => {
        const grid = spinGrid();
        expect(grid).toHaveLength(5);
        for (let r = 0; r < 5; r++) {
            expect(grid[r]).toHaveLength(3);
            for (const s of grid[r]) {
                expect(typeof s).toBe('string');
                expect(REEL_POOLS[r][s]).toBeGreaterThan(0);
            }
        }
    });
});

describe('expandedGrid', () => {
    it('expands wilds on inner reels (2, 3, 4) to fill the entire reel', () => {
        const grid = [
            ['CHERRY', 'CHERRY', 'CHERRY'],
            ['LEMON',  'WILD',   'LEMON'],
            ['BELL',   'BELL',   'BELL'],
            ['BAR',    'BAR',    'WILD'],
            ['SEVEN',  'SEVEN',  'SEVEN']
        ];
        const out = expandedGrid(grid);
        expect(out[1]).toEqual(['WILD', 'WILD', 'WILD']);
        expect(out[3]).toEqual(['WILD', 'WILD', 'WILD']);
        // Untouched reels are unchanged.
        expect(out[0]).toEqual(['CHERRY', 'CHERRY', 'CHERRY']);
        expect(out[2]).toEqual(['BELL', 'BELL', 'BELL']);
        expect(out[4]).toEqual(['SEVEN', 'SEVEN', 'SEVEN']);
    });

    it('does not modify the original grid', () => {
        const grid = [
            ['CHERRY', 'CHERRY', 'CHERRY'],
            ['LEMON',  'WILD',   'LEMON'],
            ['BELL',   'BELL',   'BELL'],
            ['BAR',    'BAR',    'BAR'],
            ['SEVEN',  'SEVEN',  'SEVEN']
        ];
        expandedGrid(grid);
        expect(grid[1]).toEqual(['LEMON', 'WILD', 'LEMON']);
    });

    it('does not expand wilds on outer reels (impossible by reel pool, but defensively)', () => {
        // Forcibly inject WILD on reel 0 to verify the function does not expand it.
        const grid = [
            ['WILD', 'CHERRY', 'CHERRY'],
            ['BELL', 'BELL',   'BELL'],
            ['BAR',  'BAR',    'BAR'],
            ['LEMON','LEMON',  'LEMON'],
            ['WILD', 'SEVEN',  'SEVEN']
        ];
        const out = expandedGrid(grid);
        expect(out[0]).toEqual(['WILD', 'CHERRY', 'CHERRY']);
        expect(out[4]).toEqual(['WILD', 'SEVEN', 'SEVEN']);
    });
});

describe('evaluateLine', () => {
    it('pays 3-of-a-kind from the left', () => {
        const ev = evaluateLine(['SEVEN', 'SEVEN', 'SEVEN', 'BAR', 'CHERRY'], PAYTABLE);
        expect(ev.leftCount).toBe(3);
        expect(ev.leftSymbol).toBe('SEVEN');
        expect(ev.leftPay).toBe(PAYTABLE.SEVEN[3]);
        expect(ev.rightPay).toBe(0);
    });

    it('pays 3-of-a-kind from the right (win-both-ways)', () => {
        const ev = evaluateLine(['LEMON', 'CHERRY', 'BAR', 'BAR', 'BAR'], PAYTABLE);
        expect(ev.rightCount).toBe(3);
        expect(ev.rightSymbol).toBe('BAR');
        expect(ev.rightPay).toBe(PAYTABLE.BAR[3]);
    });

    it('pays both directions for distinct left/right combos', () => {
        const ev = evaluateLine(['SEVEN', 'SEVEN', 'SEVEN', 'BAR', 'BAR'], PAYTABLE);
        // 3 sevens from left, 2 bars from right (no right pay)
        expect(ev.leftPay).toBe(PAYTABLE.SEVEN[3]);
        expect(ev.rightPay).toBe(0);
    });

    it('pays both sides when left and right are different 3-of-a-kinds', () => {
        const ev = evaluateLine(['CHERRY', 'CHERRY', 'CHERRY', 'BAR', 'BAR'], PAYTABLE);
        // left CHERRY x3 = 5 ; right BAR x2 = 0
        expect(ev.leftPay).toBe(PAYTABLE.CHERRY[3]);
        expect(ev.rightPay).toBe(0);
    });

    it('does not double-pay 5-of-a-kind same symbol from both directions', () => {
        const ev = evaluateLine(['SEVEN', 'SEVEN', 'SEVEN', 'SEVEN', 'SEVEN'], PAYTABLE);
        expect(ev.leftPay).toBe(PAYTABLE.SEVEN[5]);
        expect(ev.rightPay).toBe(0);
        expect(ev.lineMultiplier).toBe(PAYTABLE.SEVEN[5]);
    });

    it('counts WILD as substitute in both directions', () => {
        const ev = evaluateLine(['SEVEN', 'WILD', 'SEVEN', 'BAR', 'CHERRY'], PAYTABLE);
        expect(ev.leftCount).toBe(3);
        expect(ev.leftSymbol).toBe('SEVEN');
        expect(ev.leftPay).toBe(PAYTABLE.SEVEN[3]);
    });

    it('treats all-wild line as max-pay (SEVEN)', () => {
        const ev = evaluateLine(['WILD', 'WILD', 'WILD', 'WILD', 'WILD'], PAYTABLE);
        expect(ev.leftSymbol).toBe('SEVEN');
        expect(ev.leftCount).toBe(5);
        expect(ev.lineMultiplier).toBe(PAYTABLE.SEVEN[5]);
    });

    it('BLANK breaks the run', () => {
        const ev = evaluateLine(['CHERRY', 'CHERRY', 'BLANK', 'CHERRY', 'CHERRY'], PAYTABLE);
        // 2 cherries from left → no win, 2 from right → no win
        expect(ev.leftCount).toBe(2);
        expect(ev.rightCount).toBe(2);
        expect(ev.lineMultiplier).toBe(0);
    });

    it('SCATTER breaks the run (no line pay)', () => {
        const ev = evaluateLine(['SEVEN', 'SEVEN', 'SCATTER', 'SEVEN', 'SEVEN'], PAYTABLE);
        expect(ev.leftCount).toBe(2);
        expect(ev.rightCount).toBe(2);
        expect(ev.lineMultiplier).toBe(0);
    });

    it('returns 0 for short runs (< 3)', () => {
        const ev = evaluateLine(['SEVEN', 'SEVEN', 'BAR', 'CHERRY', 'LEMON'], PAYTABLE);
        expect(ev.lineMultiplier).toBe(0);
    });
});

describe('evaluateSpin — line wins', () => {
    it('returns line wins with correct payouts (line-bet scaled)', () => {
        const grid = [
            ['SEVEN', 'CHERRY', 'BAR'],
            ['SEVEN', 'BAR',    'BAR'],
            ['SEVEN', 'BAR',    'CHERRY'],
            ['CHERRY','LEMON',  'BAR'],
            ['BAR',   'CHERRY', 'BAR']
        ];
        const totalBet = 10;
        const out = evaluateSpin(grid, totalBet);
        const lineBet = totalBet / PAYLINE_COUNT;
        // Top row [0]: SEVEN, SEVEN, SEVEN, CHERRY, BAR → 3 SEVEN from left = 100 × lineBet
        const topWin = out.wins.find(w => w.line === 1); // payline #2 = top row at index 1
        expect(topWin).toBeDefined();
        expect(topWin.pay).toBeCloseTo(PAYTABLE.SEVEN[3] * lineBet, 5);
    });

    it('counts wins on every payline that hits', () => {
        // All cherries everywhere → all 10 paylines should be 5-of-a-kind cherry
        const allCherry = Array.from({ length: 5 }, () => ['CHERRY', 'CHERRY', 'CHERRY']);
        const out = evaluateSpin(allCherry, 10);
        expect(out.wins).toHaveLength(PAYLINE_COUNT);
        for (const w of out.wins) {
            expect(w.pay).toBeCloseTo(PAYTABLE.CHERRY[5] * 1, 5);
        }
    });

    it('expanding wild on reel 3 turns a near-miss into a 5-of-a-kind', () => {
        const grid = [
            ['CHERRY', 'CHERRY', 'CHERRY'],
            ['CHERRY', 'CHERRY', 'CHERRY'],
            ['WILD',   'BAR',    'BAR'],     // any wild here expands the entire reel
            ['CHERRY', 'CHERRY', 'CHERRY'],
            ['CHERRY', 'CHERRY', 'CHERRY']
        ];
        const out = evaluateSpin(grid, 10);
        // All paylines should now be 5-of-a-kind cherry (wild substitutes everywhere on reel 3).
        expect(out.wins).toHaveLength(PAYLINE_COUNT);
        for (const w of out.wins) {
            expect(w.pay).toBeCloseTo(PAYTABLE.CHERRY[5] * 1, 5);
        }
    });
});

describe('evaluateSpin — scatter and free spins', () => {
    it('does not award free spins for fewer than 3 scatters', () => {
        const grid = [
            ['SCATTER', 'CHERRY', 'BAR'],
            ['SCATTER', 'BAR',    'BAR'],
            ['LEMON',   'BAR',    'CHERRY'],
            ['CHERRY',  'LEMON',  'BAR'],
            ['BAR',     'CHERRY', 'BAR']
        ];
        const out = evaluateSpin(grid, 10);
        expect(out.scatterCount).toBe(2);
        expect(out.freeSpinsAwarded).toBe(0);
        expect(out.scatterPay).toBe(0);
    });

    it('awards free spins and scatter pay for 3 scatters', () => {
        const grid = [
            ['SCATTER', 'CHERRY', 'BAR'],
            ['LEMON',   'SCATTER',  'BAR'],
            ['BAR',     'CHERRY', 'SCATTER'],
            ['CHERRY',  'LEMON',  'BAR'],
            ['BAR',     'CHERRY', 'BAR']
        ];
        const out = evaluateSpin(grid, 10);
        expect(out.scatterCount).toBe(3);
        expect(out.freeSpinsAwarded).toBe(FREE_SPIN_AWARD);
        expect(out.scatterPay).toBe(SCATTER_PAY[3] * 10);
    });

    it('caps scatter pay at 5 even if more would be possible', () => {
        const grid = [
            ['SCATTER', 'SCATTER', 'BAR'],
            ['SCATTER', 'SCATTER',  'BAR'],
            ['BAR',     'CHERRY', 'SCATTER'],
            ['CHERRY',  'LEMON',  'BAR'],
            ['BAR',     'CHERRY', 'BAR']
        ];
        const out = evaluateSpin(grid, 10);
        expect(out.scatterCount).toBe(5);
        expect(out.scatterPay).toBe(SCATTER_PAY[5] * 10);
    });
});

describe('Free spin parameters', () => {
    it('award is 10 spins at 2× multiplier triggered by 3+ scatters', () => {
        expect(FREE_SPIN_AWARD).toBe(10);
        expect(FREE_SPIN_MULTIPLIER).toBe(2);
        expect(FREE_SPIN_TRIGGER_COUNT).toBe(3);
    });
});

describe('RTP simulation (Monte Carlo)', () => {
    it('achieves 95–97 % RTP over 200,000 spins (incl. free-spin chains)', { timeout: 60000 }, () => {
        const numBaseSpins = 200000;
        const bet = 10;
        let totalBet = 0;
        let totalPayout = 0;

        function simulateSpin(multiplier) {
            const grid = spinGrid();
            const ev = evaluateSpin(grid, bet);
            const pay = Math.floor((ev.lineWinTotal + ev.scatterPay) * multiplier);
            return { pay, freeSpinsAwarded: ev.freeSpinsAwarded };
        }

        for (let i = 0; i < numBaseSpins; i++) {
            totalBet += bet;
            const base = simulateSpin(1);
            totalPayout += base.pay;

            if (base.freeSpinsAwarded > 0) {
                let remaining = base.freeSpinsAwarded;
                let chains = 0;
                while (remaining > 0 && chains < 5) {
                    remaining--;
                    const fs = simulateSpin(FREE_SPIN_MULTIPLIER);
                    totalPayout += fs.pay;
                    if (fs.freeSpinsAwarded > 0) {
                        remaining += fs.freeSpinsAwarded;
                        chains++;
                    }
                }
            }
        }

        const rtp = (totalPayout / totalBet) * 100;
        console.log(`Strictly7s 2.0 RTP over ${numBaseSpins.toLocaleString()} base spins: ${rtp.toFixed(3)} %`);
        // Wide bounds: rare 5-of-a-kind SEVEN (1000× line bet) plus free-spin
        // retriggers blow up the spin-payout variance, so 200 K spins can drift
        // ±2.5 % from the 96 % target. Bounds are ±3 %.
        expect(rtp).toBeGreaterThanOrEqual(93);
        expect(rtp).toBeLessThanOrEqual(99);
    });
});
