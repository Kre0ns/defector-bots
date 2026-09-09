const NUM_FEATURES = 7;

function features(history) {
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
        1,
        last === "C" ? 1 : -1,
        2 * (oppDefected / n) - 1,
        oppDefected > 0 ? 1 : -1,
        2 * (theyBurnedMe / n) - 1, 
        2 * (iBurnedThem / n) - 1,
        Math.max(-1, Math.min(1, streak / 5)),
    ];
}

function forward(weights, x)
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

const WEIGHTS = {"W1":[[-1.6337393940951384,2.839236006786354,2.5248746871761574,1.2069999392464992,1.6223065807884154,-3.8402453447314167,-0.5239383436744872],[1.5524312403957172,0.46505745100710977,-5.927974579908437,2.228343453926002,-2.0535675240244036,5.918433998771991,-1.3131481209144986],[0.2869789952564824,2.9292477707841442,3.808097882351899,1.5278847290201805,-3.210412386869556,0.5466816959617848,-2.529300800751975],[-0.2642151124858847,-3.6032966186069437,4.020869325397639,6.775788573269538,-1.1323696100084042,3.2385985729085913,-1.684420891238091],[-2.6510957833173783,0.4518229943342759,6.9441358848667525,1.9818698613859786,3.0352908009674495,-2.818287814463405,1.249985310896295]],"W2":[-1.735774081637004,3.971703266900938,0.2599052734052102,-2.4159900834647092,3.4008772106060086],"b":-0.4143958286976374}

export default function bot({ history, memory })
{
    const x = features(history);
    const move = forward(WEIGHTS, x);
    return [move, memory];
}