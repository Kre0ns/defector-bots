import { readdirSync } from 'fs';
import { pathToFileURL } from 'url';
import { features, forward } from './core.js';
import path from 'path';
import { plot } from 'nodeplotlib';
import { BehaviorSubject } from 'rxjs';

export const POOL_DIR = "./pool"
const NUM_FEATURES = 7;
const NUM_HIDDEN = 5;
const POP_SIZE = 60;
const TRAINING_CYCLES = 400;
const INITIAL_STEP = 1;
const ANNEAL_MULTIPLIER = 0.995;
const MIN_STEP = 0.01;
const NUM_SURVIVORS = 15;

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
            console.log(`skip ${file}`)
        }
    }

    return pool;
}

function initWeights()
{
    const weights = {
        W1: [],
        W2: [],
        b: 0
    }

    for (let i = 0; i < NUM_HIDDEN; i++)
    {
        const nodeWeights = []

        for (let j = 0; j < NUM_FEATURES; j++)
        {
            nodeWeights.push((Math.random() * 2 - 1) * 0.5);
        }

        weights.W1.push(nodeWeights)
    }

    for (let i = 0; i < NUM_HIDDEN; i++)
    {
        weights.W2.push((Math.random() * 2 - 1) * 0.5);
    }

    weights.b = (Math.random() * 2 - 1) * 0.5

    return weights;
}

function makeBot(weights)
{
    return ({history}) => [forward(weights, features(history)), null];
}

function playMatch(botA, botB, rounds, matchSeed)
{
    const realRandom = Math.random;
    let s = (matchSeed >>> 0) || 1;

    Math.random = () => {
        s = (s * 1664525 + 1013904223) >>> 0;
        return s / 4294967296;
    };

    let memoryA = null;
    let memoryB = null;

    const historyA = []
    const historyB = []

    let scoreA = 0;
    let scoreB = 0;

    try
    {
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
    }
    finally
    {
        Math.random = realRandom;
    }

    return [scoreA / rounds, scoreB / rounds];
}

function scoreCandidate(weights, opponents, gen)
{
    let total = 0;

    const candidate = makeBot(weights);

    for (let i = 0; i < opponents.length; i++)
    {
        const result = playMatch(candidate, opponents[i].fn, 120, gen * 1000 + i);
        total += result[0];
    }

    return total / opponents.length;
}

function mutate(weightsOld, step)
{
    const weightsNew = {
        W1: [],
        W2: [],
        b: 0
    }

    for (let i = 0; i < NUM_HIDDEN; i++)
    {
        const nodeWeightsNew = []
        const nodeWeightsOld = weightsOld.W1[i];

        for (let j = 0; j < NUM_FEATURES; j++)
        {
            nodeWeightsNew.push(nodeWeightsOld[j] + (Math.random() * 2 - 1) * step);
        }

        weightsNew.W1.push(nodeWeightsNew)
    }

    for (let i = 0; i < NUM_HIDDEN; i++)
    {
        weightsNew.W2.push(weightsOld.W2[i] + (Math.random() * 2 - 1) * step);
    }

    weightsNew.b = weightsOld.b + (Math.random() * 2 - 1) * step

    return weightsNew;
}

async function train()
{
    const gens = [], best = [], bench = [];
    const stream$ = new BehaviorSubject([]);

    plot(stream$);

    let survivors = [];
    const pool = await loadPool();

    for (let i = 0; i < NUM_SURVIVORS; i++) survivors.push(initWeights());

    let step = INITIAL_STEP;

    for (let i = 0; i < TRAINING_CYCLES; i++)
    {
        let population = [...survivors];

        for (let j = 0; j < POP_SIZE - NUM_SURVIVORS; j++) population.push(mutate(survivors[Math.floor(Math.random() * survivors.length)], step));

        let scored = []

        for (const w of population)
        {
            scored.push({weights: w, score: scoreCandidate(w, pool, i)});
        }

        scored.sort((a,b) => b.score - a.score);
        survivors = scored.slice(0, NUM_SURVIVORS).map(s => s.weights);

        gens.push(i);
        best.push(scored[0].score);
        bench.push(scoreCandidate(survivors[0], pool, 0));

        stream$.next([
            {x: gens, y: best, type: 'scatter', mode: "markers", name: 'gen-best'},
            {x: gens, y: bench, type: 'scatter', mode: "lines", name: 'benchmark'},
        ]);

        await new Promise(r => setImmediate(r));

        step = Math.max(MIN_STEP, step * ANNEAL_MULTIPLIER);
    }

    return survivors[0];
}

const champ = await train();
console.log("\nCHAMP    ", JSON.stringify(champ));

const pool = await loadPool();
console.log("Champ score: ", scoreCandidate(champ, pool, 0));