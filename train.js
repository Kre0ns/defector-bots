import { features, forward, NUM_FEATURES } from "./core.js";
import { trainPool } from "./pool/index.js"

const NUM_HIDDEN = 5;
const POP_SIZE = 60;
const TRAINING_CYCLES = 3000;
const INITIAL_STEP = 1.0;
const ANNEAL_MULTIPLIER = 0.997;
const MIN_STEP = 0.02;
const NUM_SURVIVORS = 15;

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
        const resultA = botA({history: historyA, memory: memoryA});
        const resultB = botB({history: historyB, memory: memoryB});

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

function scoreCandidate(weights, opponents)
{
    let total = 0;

    const candidate = makeBot(weights);

    for (const opponent of opponents)
    {
        const result = playMatch(candidate, opponent, 120);
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

function train()
{
    let survivors = [];

    for (let i = 0; i < NUM_SURVIVORS; i++) survivors.push(initWeights());

    let step = INITIAL_STEP;

    for (let i = 0; i < TRAINING_CYCLES; i++)
    {
        let population = [...survivors];

        for (let j = 0; j < POP_SIZE - NUM_SURVIVORS; j++) population.push(mutate(survivors[Math.floor(Math.random() * survivors.length)], step));

        let scored = []

        for (const w of population)
        {
            scored.push({weights: w, score: scoreCandidate(w, trainPool)});
        }

        scored.sort((a,b) => b.score - a.score);
        survivors = scored.slice(0, NUM_SURVIVORS).map(s => s.weights);

        console.log(`gen ${i}   best ${scored[0].score.toFixed(3)}`);

        step = Math.max(MIN_STEP, step * ANNEAL_MULTIPLIER);
    }

    return survivors[0];
}

const champ = train();
console.log("\nCHAMP    ", JSON.stringify(champ));

console.log("Champ score: ", scoreCandidate(champ, bestBots));