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

const WEIGHTS = {"W1":[[-1.6145362496060849,3.7509903069242836,-1.8322902643723848,-1.9132757488633818,2.943291821703751,5.173277082067565,-2.652382309073468],[-0.14639845341820543,0.3893633667965855,6.199269624419485,0.1164295518152517,1.3256824963478804,1.5168433822537004,-0.6310435154031871],[0.6415441054732676,-1.7190916162686567,5.334977591196581,4.040211573045248,-4.19855755815844,4.603693519406277,-1.4218637692210017],[-2.3743140129271842,1.9912125610018017,-1.6891335969733303,-0.0003937176172176815,-3.9259657883211134,-1.6584693889775315,-0.17743428353669663],[0.6537160135016091,2.892678311627695,-1.646235078819875,-0.3191420316638559,-4.332139801738868,-5.4509755057326625,-3.5968757645929985]],"W2":[-1.772047066711921,3.463157612907899,-4.13761600330939,2.52051776389933,-1.2842091303297716],"b":1.365657064554901};

export default function bot({ history, memory })
{
    const x = features(history);
    const move = forward(WEIGHTS, x);
    return [move, memory];
}