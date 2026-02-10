import fs from 'fs';
import path from 'path';
import https from 'https';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ARTICLE_URL = 'https://xueqiu.com/8492558431/211895460';
const OUTPUT_DIR = path.resolve(__dirname, '../knowledge/wyckoff');
const IMAGES_DIR = path.join(OUTPUT_DIR, 'images');

if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });
if (!fs.existsSync(IMAGES_DIR)) fs.mkdirSync(IMAGES_DIR, { recursive: true });

const fetchUrl = (url, options = {}) => {
    return new Promise((resolve, reject) => {
        // Xueqiu might require User-Agent
        const urlObj = new URL(url);
        const reqOptions = {
            hostname: urlObj.hostname,
            path: urlObj.pathname + urlObj.search,
            method: 'GET',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                ...options.headers
            }
        };

        const req = https.request(reqOptions, (res) => {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                const redirectUrl = new URL(res.headers.location, url).toString();
                fetchUrl(redirectUrl, options).then(resolve).catch(reject);
                return;
            }
            let data = [];
            res.on('data', chunk => data.push(chunk));
            res.on('end', () => resolve(Buffer.concat(data)));
        });
        req.on('error', reject);
        req.end();
    });
};

const downloadImage = async (url, filename) => {
    try {
        // Handle protocol-relative URLs
        if (url.startsWith('//')) url = 'https:' + url;

        const buffer = await fetchUrl(url);
        fs.writeFileSync(path.join(IMAGES_DIR, filename), buffer);
        console.log(`Downloaded image: ${filename}`);
        return true;
    } catch (e) {
        console.error(`Failed to download image ${url}:`, e.message);
        return false;
    }
};

const cleanHtml = (html) => {
    let text = html.replace(/<script\b[^>]*>([\s\S]*?)<\/script>/gim, "");
    text = text.replace(/<style\b[^>]*>([\s\S]*?)<\/style>/gim, "");

    // Xueqiu images often in <img ... class="ke_img" ... src="...">
    text = text.replace(/<img[^>]+src="([^">]+)"[^>]*>/g, (match, src) => {
        return `\n[IMAGE_REF: ${src}]\n`;
    });

    text = text.replace(/<[^>]+>/g, ' ');
    text = text.replace(/\s+/g, ' ').trim();
    return text;
};

const main = async () => {
    console.log(`Fetching Wyckoff Article: ${ARTICLE_URL}`);
    try {
        const buffer = await fetchUrl(ARTICLE_URL);
        let html = buffer.toString('utf-8');

        const content = cleanHtml(html);

        // Find all image refs
        const imgRegex = /\[IMAGE_REF: (.*?)\]/g;
        let match;
        let finalContent = content;
        let imgCount = 0;

        while ((match = imgRegex.exec(content)) !== null) {
            let imgUrl = match[1];
            if (imgUrl.startsWith('//')) imgUrl = 'https:' + imgUrl;

            // Clean URL query params for filename
            const urlObj = new URL(imgUrl);
            let ext = path.extname(urlObj.pathname) || '.png';
            if (ext.length > 5) ext = '.png'; // Fallback

            const imgName = `wyckoff_${++imgCount}${ext}`;

            if (imgUrl.startsWith('http')) {
                await downloadImage(imgUrl, imgName);
                finalContent = finalContent.replace(match[0], `[知识库图片: knowledge/wyckoff/images/${imgName}]`);
            }
        }

        const outFile = path.join(OUTPUT_DIR, 'wyckoff_method.txt');
        fs.writeFileSync(outFile, `Source: ${ARTICLE_URL}\n\n${finalContent}`);
        console.log(`Saved analysis to: ${outFile}`);

    } catch (e) {
        console.error("Main Error:", e);
    }
};

main();
