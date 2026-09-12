import { writeFileSync, rmSync, mkdirSync } from 'fs';
import { parse } from 'devalue';

const POOL_DIR = "./pool"
const TARGET_SIZE = 149;
const DELAY = 10000

function sleep(ms)
{
    return new Promise(r => setTimeout(r, ms));
}

async function fetchIds()
{
    const controller = new AbortController();
    let raw = "";
    
    try
    {
        const res = await fetch("https://defector.hackclub.com/_app/remote/1jsclqx/leaderboardData", {
            signal: controller.signal,
            headers: {Accept: "*/*", Referer: "https://defector.hackclub.com/leaderboard"}
        });

        for await (const chunk of res.body)
        {
            raw += Buffer.from(chunk).toString("utf-8");
            if (raw.includes("\n") && raw.startsWith("data: "))
            {
                controller.abort();
                break;
            }
        }
    }
    catch (e)
    {
        if (e.name !== "AbortError") throw e; 
    }

    const json = JSON.parse(raw.slice(6));
    const result = json.result;
    const parsedResult = parse(result);
    const battles = parsedResult.battles;

    const pool = new Set();

    for (const battle of battles)
    {
        for (const id of battle.botIds) pool.add(id);
    }

    return pool;
}

async function poolIds()
{
    const pool = new Set();
    let first = true;

    do 
    {
        if (!first) await sleep(DELAY);
        else first = false;

        const subPool = await fetchIds();
        subPool.forEach(id => {
            pool.add(id);
        });

        console.log(`Pulled     ${pool.size}/${TARGET_SIZE}`);

    } while (pool.size < TARGET_SIZE)

    return pool;
}

function unescapeHtml(html)
{
    return html
        .replaceAll("&lt;", "<")
        .replaceAll("&gt;", ">")
        .replaceAll("&quot;", '"')
        .replaceAll("&#39;", "'")
        .replaceAll("&amp;", "&");
}

async function fetchBot(id)
{
    const res = await fetch(`https://defector.hackclub.com/bot/${id}`, {
        headers: { Accept: "text/html" }
    });

    const html = await res.text();

    const openCode = html.indexOf("<code>");
    const closeCode = html.indexOf("</code>");

    const openTitle = html.indexOf('<h1 class="text-2xl font-bold pt-4">');
    const closeTitle = html.indexOf('</h1> <p');

    const code = html.slice(openCode + 6, closeCode);

    return { name: html.slice(openTitle + 36, closeTitle), code: unescapeHtml(code)};
}

function writeBot(id, name, code)
{
    const content = `// ${name}\n// ${id}\n${code}`;
    writeFileSync(`${POOL_DIR}/${id}.js`, content, "utf-8");
}

function resetPool()
{
    rmSync(POOL_DIR, { recursive: true, force: true });
    mkdirSync(POOL_DIR, { recursive: true });
}

resetPool();

const ids = await poolIds();

for (const id of ids)
{
    const bot = await fetchBot(id);
    writeBot(id, bot.name, bot.code);
    console.log(`Wrote  ${id}   ${bot.name}`);
}

console.log("Done");