export function features(history) {
    const n = history.length !== 0 ? history.length : 0.1;

    const last = history.at(-1)?.opponent;
    
    let oppDefected = 0;          
    let theyBurnedMe = 0;
    let iBurnedThem = 0;  
    for (const round of history) {
        if (round.opponent === "D") oppDefected++;
        
        if (round.opponent !== round.you)
        {
            if (round.opponent === "D") theyBurnedMe++;
            else iBurnedThem++;
        }
    }

    let streak = 0;
    for (let i = history.length - 1; i >= 0; i--)
    {
        if (history[i].opponent !== last) break;
        streak++;
    }

    if (last === "D") streak = -streak;

    return [
        1, // bias
        last === "C" ? 1 : -1, // Last turn
        2 * (oppDefected / n) - 1, // Ratio of defections to rounds normalized
        oppDefected > 0 ? 1 : -1, // Ever defected
        2 * (theyBurnedMe / n) - 1, // Ratio of the number of times they burned us to rounds
        2 * (iBurnedThem / n) - 1, // Ratio of the number of times we burned them to rounds
        Math.max(-1, Math.min(1, streak / 5)), // The streak of the same action
    ];
}

export function forward(weights, x)
{
    const hidden = []
    for (let i = 0; i < weights.W1.length; i++)
    {
        let s = 0;
        
        for (let j = 0; j < x.length; j++)
        {
            s += weights.W1[i][j] * x[j];
        }

        hidden.push(Math.tanh(s));
    }
    
    let out = weights.b;
    for (let i = 0; i < weights.W2.length; i++)
    {
        out += weights.W2[i] * hidden[i]
    }
    
    return out > 0 ? "C" : "D"
}