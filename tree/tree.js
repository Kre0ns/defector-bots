import { readdirSync } from 'fs';
import { pathToFileURL } from 'url';
import path from 'path';

const POOL_DIR = "../pool";
const PROBE = "CCDCDDCDCCDCDDCDCCDCDDCDCCDCDDCD".split("");
const CANDIDATES = [
    { name: "allC", fn: () => "C" },
    { name: "allD", fn: () => "D" },
    { name: "tft", fn: (h) => h.length ? h.at(-1).opponent : "C"},
    { name: "stft", fn: (h) => h.length ? h.at(-1).opponent : "D"},
];

async function loadPool() 
{
    const files = readdirSync(POOL_DIR);
    const pool = [];

    for (const file of files)
    {
        const full = path.resolve(POOL_DIR, file);

        try 
        {
            const bot = await import(pathToFileURL(full).href);
            pool.push( {name: file, fn: bot.default});
        }
        catch (e)
        {
            console.log(`skipped TS: ${file}`)
        }
    }

    return pool;
}

function simulate(bot, myMoves, seed = 1, startMemory = null, startHistory = [])
{
    const realRandom = Math.random;
    let s = (seed >>> 0) || 1;

    Math.random = () => {
        s = (s * 1664525 + 1013904223) >>> 0;
        return s / 4294967296;
    };

    const replies = [];
    const history = [...startHistory];
    let memory = startMemory;
    let score = 0;

    try
    {
        for (const myMove of myMoves)
        {
            let result = null;
            try { result = bot.fn({history, memory}); }
            catch { return null; }

            const botMove = result?.[0];
            if (botMove !== "C" && botMove !== "D") return null;

            score += payoff(myMove, botMove);
            replies.push(botMove);

            memory = result[1];
            history.push({ you: botMove, opponent: myMove });
        }
    }
    finally
    {
        Math.random = realRandom;
    }

    return { replies, score, memory, history};
}

function filterPool(pool)
{
    const newPool = [];

    for (const bot of pool)
    {
        const moveSets = [];
        let deterministic = true;

        for (const seed of [1,2,3,4,5])
        {
            const result = simulate(bot, PROBE, seed);

            if (result === null) 
            {
                deterministic = false;
                break;
            }

            moveSets.push(result.replies.join(""));
        }
        
        deterministic = deterministic ? moveSets.every(m => m === moveSets[0]) : deterministic;

        if (deterministic) newPool.push({ ...bot, fp: moveSets[0] });
        else console.log(`skipped non-deterministic: ${bot.name}`);
    }

    const fps = [...newPool].map(b => b.fp);
    console.log(`${fps.length} bots -> ${new Set(fps).size} distinct`); 

    return newPool;
}

function split(alive, history, move)
{
    const myMoves = [...history.map(m => m.you), move];
    const groupC = [];
    const groupD = [];

    for (const bot of alive)
    {
        const result = simulate(bot, myMoves);
        if (result === null) continue;
        (result.replies.at(-1) === "C" ? groupC : groupD).push(bot);
    }

    return {groupC, groupD};
}

function payoff(myMove, theirMove)
{
    if (myMove === theirMove) return myMove === "C" ? 2 : 1;
    return myMove === "C" ? 0 : 3;
}

function solveLeaf(leaf, history, rounds)
{
    let best = null;

    const openingMoves = history.map(r => r.you);
    
    for (const candidate of CANDIDATES)
    {
        const opening = openingMoves.length ? simulate(leaf, openingMoves) : { memory: null, history: [] };

        if (opening === null) return null;

        let botMemory = opening.memory;
        let botHistory = opening.history;

        const myHistory = [...history];
        const moves = [];
        let value = 0;

        for (let round = history.length; round < rounds; round++)
        {
            const myMove = candidate.fn(myHistory);

            const step = simulate(leaf, [myMove], 1, botMemory, botHistory);

            if (step === null)
            {
                value += (rounds - round) * 3;
                break;
            }

            botMemory = step.memory;
            botHistory = step.history;

            value += step.score;
            moves.push(myMove);

            myHistory.push({ you: myMove, opponent: step.replies[0] });
        }

        if (best === null || value > best.value)
        {
            best = { name: candidate.name, moves, value};
        }

    }

    return best;
}

const pool = await loadPool();
const alive = filterPool(pool);