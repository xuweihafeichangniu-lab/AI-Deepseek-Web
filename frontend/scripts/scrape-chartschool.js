import fs from 'fs';
import path from 'path';
import https from 'https';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BASE_URL = 'https://chartschool.stockcharts.com';
const INDEX_URL = 'https://chartschool.stockcharts.com/table-of-contents/overview';
const OUTPUT_DIR = path.resolve(__dirname, '../knowledge/chartschool');

if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

const fetchUrl = (url) => {
    return new Promise((resolve, reject) => {
        const req = https.get(url, (res) => {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                const redirectUrl = new URL(res.headers.location, url).toString();
                fetchUrl(redirectUrl).then(resolve).catch(reject);
                return;
            }
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve(data));
        });
        req.on('error', reject);
    });
};

const cleanHtml = (html) => {
    let text = html.replace(/<script\b[^>]*>([\s\S]*?)<\/script>/gim, "");
    text = text.replace(/<style\b[^>]*>([\s\S]*?)<\/style>/gim, "");
    text = text.replace(/<[^>]+>/g, ' ');
    text = text.replace(/\s+/g, ' ').trim();
    return text;
};

const extractLinks = (html) => {
    const links = [];
    const regex = /href="([^"]*)"/g;
    let match;
    while ((match = regex.exec(html)) !== null) {
        let link = match[1];
        if (link.startsWith('/')) {
            links.push(BASE_URL + link);
        } else if (link.startsWith('http')) {
            links.push(link);
        }
    }
    // Filter relevant links from overview page
    return [...new Set(links)].filter(l => l.includes('chartschool.stockcharts.com/table-of-contents/overview/'));
};

const main = async () => {
    console.log(`Fetching Index: ${INDEX_URL}`);
    try {
        const indexHtml = await fetchUrl(INDEX_URL);
        const links = extractLinks(indexHtml);
        console.log(`Found ${links.length} relevant articles.`);

        for (const link of links) {
            const name = link.split('/').pop() || 'index';
            const filename = path.join(OUTPUT_DIR, `${name}.txt`);

            if (fs.existsSync(filename)) {
                console.log(`Skipping existing: ${name}`);
                continue;
            }

            console.log(`Downloading: ${link}`);
            try {
                const articleHtml = await fetchUrl(link);
                const content = cleanHtml(articleHtml);
                fs.writeFileSync(filename, `Source: ${link}\n\n${content}`);
            } catch (e) {
                console.error(`Failed to download ${link}:`, e.message);
            }

            await new Promise(r => setTimeout(r, 500));
        }
        console.log("Done!");
    } catch (e) {
        console.error("Main Error:", e);
    }
};

main();
