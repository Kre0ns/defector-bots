import { readdirSync, readFileSync, writeFileSync } from 'fs';
import { pathToFileURL } from 'url';
import path from 'path';

const POOL_DIR = "../pool";
const CANDIDATES = [
    { name: "allC", fn: () => "C" },
    { name: "allD", fn: () => "D" },
    { name: "tft", fn: (h) => h.length ? h.at(-1).opponent : "C"},
    { name: "tf2t",    fn: (h) => h.length >= 2 && h.at(-1).opponent === "D" && h.at(-2).opponent === "D" ? "D" : "C" },
    { name: "pavlov",  fn: (h) => {
        if (!h.length) return "C";
        const l = h.at(-1);
        return l.opponent === "C" ? l.you : (l.you === "C" ? "D" : "C");
    }},
];
const DEPTH_LIMIT = Number(process.env.DEPTH ?? 13);

async function loadPool() 
{
    const files = readdirSync(POOL_DIR);
    const pool = [];
    let tsCount = 0;
    let randomCount = 0;

    for (const file of files)
    {
        const full = path.resolve(POOL_DIR, file);

        const src = readFileSync(full, "utf-8");
        if (/Math\.random/.test(src))
        {
            console.log(`skipped non-deterministic: ${file}`);
            randomCount++;
            continue;
        }

        try 
        {
            const bot = await import(pathToFileURL(full).href);
            pool.push( { bot: { name: file, fn: bot.default }, memory: null, history: [] });
        }
        catch (e)
        {
            console.log(`skipped TS: ${file}`)
            tsCount++;
        }
    }

    console.log(`Loaded ${pool.length} out of ${files.length} files.\nTotal TS: ${tsCount}\nTotal non-deterministic: ${randomCount}`);

    return pool;
} 

async function loadAll()
{
    const files = readdirSync(POOL_DIR);
    const pool = [];

    for (const file of files)
    {
        const full = path.resolve(POOL_DIR, file);

        try 
        {
            const bot = await import(pathToFileURL(full).href);
            pool.push( { bot: { name: file, fn: bot.default }, memory: null, history: [] });
        }
        catch
        {
        }
    }

    return pool;
}

let simCalls = 0;
let simRounds = 0;

function simulate(bot, myMoves, seed = 1, startMemory = null, startHistory = [])
{
    simCalls++;
    simRounds += myMoves.length;

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

let splitCalls = 0;

function split(alive, move)
{
    splitCalls++;

    const groupC = [];
    const groupD = [];

    for (const entry of alive)
    {
        let memory;
        try { memory = structuredClone(entry.memory); }
        catch { memory = entry.memory; }

        const step = simulate(entry.bot, [move], 1, memory, entry.history);
        if (step === null) continue;

        const next = { bot: entry.bot, memory: step.memory, history: step.history};
        (step.replies.at(-1) === "C" ? groupC : groupD).push(next);
    }

    return {groupC, groupD};
}

function payoff(myMove, theirMove)
{
    if (myMove === theirMove) return myMove === "C" ? 2 : 1;
    return myMove === "C" ? 0 : 3;
}

const groupMemo = new Map();
const winCounts = new Map();

function solveGroup(alive, history, rounds)
{
    const key = alive.map(e => e.bot.name).sort().join("|") + "@" + history.map(r => r.you).join("") + "@" + rounds;
    const hit = groupMemo.get(key);

    if (hit !== undefined) return hit;

    let best = null;
    
    for (const candidate of CANDIDATES)
    {
        let total = 0;
        
        for (const entry of alive)
        {
            let botMemory;
            try { botMemory = structuredClone(entry.memory); }
            catch { botMemory = entry.memory; }

            let botHistory = entry.history;

            const myHistory = [...history];
            let value = 0;

            for (let round = history.length; round < rounds; round++)
            {
                const myMove = candidate.fn(myHistory);

                const step = simulate(entry.bot, [myMove], 1, botMemory, botHistory);

                if (step === null)
                {
                    value += (rounds - round) * 3;
                    break;
                }

                botMemory = step.memory;
                botHistory = step.history;

                value += step.score;

                myHistory.push({ you: myMove, opponent: step.replies[0] });
            }

            total += value;
        }

        const mean = total / alive.length;

        if (best === null || mean > best.value)
        {
            best = { name: candidate.name, value: mean};
        }

    }

    winCounts.set(best.name, (winCounts.get(best.name) ?? 0) + 1);

    groupMemo.set(key, best);
    return best;
}

let calls = 0;
let lastPrint = Date.now();
const solveMemo = new Map();

function solve(alive, history, rounds)
{
    calls++;
    if (Date.now() - lastPrint > 1000)
    {
        lastPrint = Date.now();
        process.stdout.write(`\r${calls} calls  depth ${history.length} alive ${alive.length}`);
    }

    if (history.length >= rounds) return { value: 0 };

    if (alive.length === 1 || history.length === DEPTH_LIMIT) return solveGroup(alive, history, rounds);

    const key = alive.map(e => e.bot.name).sort().join("|") + "@" + history.map(r => r.you).join("");

    const hit = solveMemo.get(key);
    if (hit !== undefined) return hit;

    let best = null;

    for (const myMove of ["C", "D"])
    {
        const { groupC, groupD } = split(alive, myMove);

        let total = 0;
        const children = {};

        for (const [theirMove, group] of [["C", groupC], ["D", groupD]])
        {
            if (group.length === 0) continue;

            const weight = group.length / (groupC.length + groupD.length);
            const p = payoff(myMove, theirMove);

            const child = solve(group, [...history, { you: myMove, opponent: theirMove }], rounds);

            total += weight * (p + child.value);

            children[theirMove] = child;
        }

        if (best === null || total > best.value) best = { value: total, move: myMove, children};
    }

    solveMemo.set(key, best);
    return best;
}

function visit(node, rows, seen)
{
    if (seen.has(node)) return seen.get(node);

    const idx = rows.length;
    rows.push(null);
    seen.set(node, idx);

    if (node.children === undefined)
    {
        rows[idx] = [-1, CANDIDATES.findIndex(c => c.name === node.name), -1];
        return idx;
    }

    const move = node.move === "C" ? 0 : 1;
    const c = node.children.C !== undefined ? visit(node.children.C, rows, seen) : -1;
    const d = node.children.D !== undefined ? visit(node.children.D, rows, seen) : -1;

    rows[idx] = [move, c, d];
    return idx;
}

function flatten(root)
{
    const rows = [];
    visit(root, rows, new Map());
    return rows;
}

function playMatch(botA, botB, rounds)
{
    let memoryA = null;
    let memoryB = null;

    const historyA = []
    const historyB = []

    let scoreA = 0;
    let scoreB = 0;

    for (let i = 0; i < rounds; i++)
    {
        let resultA = null;
        try { resultA = botA({history: historyA, memory: memoryA}); }
        catch { return [0, 3]; }
        
        let resultB = null;
        try { resultB = botB({history: historyB, memory: memoryB}); }
        catch { return [3, 0]; } 

        const choiceA = resultA[0];
        const choiceB = resultB[0];

        memoryA = resultA[1];
        memoryB = resultB[1];

        historyA.push({ you: choiceA, opponent: choiceB });
        historyB.push({ you: choiceB, opponent: choiceA });

        if (choiceA === choiceB)
        {
            if (choiceA === "C")
            {
                scoreA += 2;
                scoreB += 2;
            }
            else
            {
                scoreA += 1;
                scoreB += 1;
            }
        }
        else
        {
            if (choiceA === "C") scoreB += 3;
            else scoreA += 3;
        }
    }

    return [scoreA / rounds, scoreB / rounds];
}


const all = await loadAll();

const myBot = all.find(e => e.bot.name === "slim_jeans.js");

let total = 0, n = 2000, i = 0;
while (i < n)
{
    const e = all[Math.floor(Math.random() * all.length)];
    if (e === myBot) continue;

    total += playMatch(myBot.bot.fn, e.bot.fn, 100)[0];
    i++;
}
console.log(`scored ${total / n} over ${n} battles`)


// const pool = await loadPool();

// const time = Date.now();
// const root = solve(pool, [], 100);
// const elapsed = Date.now() - time;

// console.log("\n", root.move, root.value);
// console.log(Date.now() - time);

// console.log(`\nDEPTH ${DEPTH_LIMIT}  move ${root.move}  value ${root.value}  perRound ${(root.value / 100)}  ${elapsed}ms`);

// console.log(`sim calls ${simCalls}, sim rounds ${simRounds}, split calls ${splitCalls}`);
// console.log(`solveMemo ${solveMemo.size} entries, groupMemo ${groupMemo.size}`);
// console.log([...winCounts.entries()].sort((a, b) => b[1] - a[1]));

// const rows = flatten(root);
// console.log(`tree: ${rows.length} nodes`);
// writeFileSync("tree.json", JSON.stringify(rows));