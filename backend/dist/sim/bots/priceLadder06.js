/** USD size for each leg after the matching side crosses 0.6 (×3 each step). */
const LADDER_USD = [1, 3, 9, 27, 81];
const ENTRY = 0.6;
const EXIT_FIRST = 0.9;
function opposite(o) {
    return o === "UP" ? "DOWN" : "UP";
}
function mark(row, outcome) {
    return outcome === "UP" ? row.up_mid : row.down_mid;
}
/** True when price crosses from strictly below ENTRY to at/above ENTRY. */
function crossedUp(prev, cur) {
    if (cur === null)
        return false;
    if (prev === null)
        return cur >= ENTRY;
    return prev < ENTRY && cur >= ENTRY;
}
/**
 * Alternating ladder on 0.6 crosses:
 * 1) First side to cross 0.6 → buy $1
 * 2) Opposite crosses 0.6 → $3
 * 3) First side crosses again → $9
 * 4) Opposite → $27
 * 5) First side → $81
 *
 * If the first side’s price reaches 0.9, stop new buys and sell all UP and DOWN (may take two rows).
 *
 * State resets at each campaign’s first row (`ctx.i === 0`) so backtests stay independent.
 */
let firstSide = null;
/** Count of ladder BUY legs already executed (0…5). */
let buysDone = 0;
let prevUp = null;
let prevDown = null;
let liquidate = false;
/** After first side hits 0.9, no further ladder buys. */
let ladderLocked = false;
export const priceLadder0609Bot = {
    name: "price-ladder-0.6-0.9-v1",
    decide(row, ctx) {
        if (ctx.i === 0) {
            firstSide = null;
            buysDone = 0;
            prevUp = null;
            prevDown = null;
            liquidate = false;
            ladderLocked = false;
        }
        const u = row.up_mid;
        const d = row.down_mid;
        const finishPrev = () => {
            prevUp = u;
            prevDown = d;
        };
        if (liquidate) {
            if (ctx.position.up > 0) {
                finishPrev();
                return { type: "MARKET", outcome: "UP", side: "SELL", shares: ctx.position.up };
            }
            if (ctx.position.down > 0) {
                finishPrev();
                return { type: "MARKET", outcome: "DOWN", side: "SELL", shares: ctx.position.down };
            }
            liquidate = false;
            finishPrev();
            return { type: "HOLD" };
        }
        if (firstSide) {
            const mFirst = mark(row, firstSide);
            if (mFirst !== null && mFirst >= EXIT_FIRST) {
                ladderLocked = true;
                if (ctx.position.up > 0 || ctx.position.down > 0)
                    liquidate = true;
                if (ctx.position.up > 0) {
                    finishPrev();
                    return { type: "MARKET", outcome: "UP", side: "SELL", shares: ctx.position.up };
                }
                if (ctx.position.down > 0) {
                    finishPrev();
                    return { type: "MARKET", outcome: "DOWN", side: "SELL", shares: ctx.position.down };
                }
            }
        }
        if (ladderLocked || buysDone >= LADDER_USD.length) {
            finishPrev();
            return { type: "HOLD" };
        }
        if (buysDone === 0) {
            const upX = crossedUp(prevUp, u);
            const dnX = crossedUp(prevDown, d);
            if (!upX && !dnX) {
                finishPrev();
                return { type: "HOLD" };
            }
            let side;
            if (upX && dnX)
                side = (u ?? 0) >= (d ?? 0) ? "UP" : "DOWN";
            else if (upX)
                side = "UP";
            else
                side = "DOWN";
            firstSide = side;
            buysDone = 1;
            finishPrev();
            return {
                type: "MARKET",
                outcome: side,
                side: "BUY",
                shares: 0,
                notionalUsd: LADDER_USD[0],
            };
        }
        const nextLeg = buysDone;
        if (nextLeg >= LADDER_USD.length) {
            finishPrev();
            return { type: "HOLD" };
        }
        const target = nextLeg % 2 === 1 ? opposite(firstSide) : firstSide;
        const p = target === "UP" ? prevUp : prevDown;
        const c = target === "UP" ? u : d;
        if (!crossedUp(p, c)) {
            finishPrev();
            return { type: "HOLD" };
        }
        buysDone += 1;
        finishPrev();
        return {
            type: "MARKET",
            outcome: target,
            side: "BUY",
            shares: 0,
            notionalUsd: LADDER_USD[nextLeg],
        };
    },
};
//# sourceMappingURL=priceLadder06.js.map