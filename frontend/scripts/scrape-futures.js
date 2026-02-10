import fs from 'fs';
import path from 'path';
import https from 'https';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ARTICLE_URL = 'https://t.10jqka.com.cn/pid_388758248.shtml';
const OUTPUT_DIR = path.resolve(__dirname, '../knowledge/futures_patterns');
const IMAGES_DIR = path.join(OUTPUT_DIR, 'images');

if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });
if (!fs.existsSync(IMAGES_DIR)) fs.mkdirSync(IMAGES_DIR, { recursive: true });

const fetchUrl = (url) => {
    return new Promise((resolve, reject) => {
        const req = https.get(url, (res) => {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                const redirectUrl = new URL(res.headers.location, url).toString();
                fetchUrl(redirectUrl).then(resolve).catch(reject);
                return;
            }
            let data = [];
            res.on('data', chunk => data.push(chunk));
            res.on('end', () => resolve(Buffer.concat(data)));
        });
        req.on('error', reject);
    });
};

const downloadImage = async (url, filename) => {
    try {
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
    // Basic cleaning, removing scripts styles etc
    let text = html.replace(/<script\b[^>]*>([\s\S]*?)<\/script>/gim, "");
    text = text.replace(/<style\b[^>]*>([\s\S]*?)<\/style>/gim, "");
    // Try to isolate the main content div if possible. 
    // 10jqka usually uses .main-text or similar. 
    // Heuristic: Find the longest block of text or look for specific markers?
    // Let's just strip tags for now but keep IMG tags as markers

    // Replace <img ... src="..."> with [IMAGE: url]
    text = text.replace(/<img[^>]+src="([^">]+)"[^>]*>/g, (match, src) => {
        return `\n[IMAGE_REF: ${src}]\n`;
    });

    text = text.replace(/<[^>]+>/g, ' ');
    text = text.replace(/\s+/g, ' ').trim();
    return text;
};

const main = async () => {
    console.log(`Fetching Article: ${ARTICLE_URL}`);
    try {
        const buffer = await fetchUrl(ARTICLE_URL);
        // Convert buffer to string, assuming UTF-8 or GBK? 
        // 10jqka might use GBK. If so, we need iconv-lite. 
        // Let's try utf-8 first, if it looks garbage we might need iconv.
        // Node.js TextDecoder can handle some encodings.

        let html = buffer.toString('utf-8');

        // Simple check for charset in meta tag
        const charsetMatch = html.match(/charset=["']?([^"'>]+)/i);
        if (charsetMatch && charsetMatch[1].toLowerCase().includes('gb')) {
            console.log("Detected GBK/GB2312, but running without iconv. Characters might be garbled.");
            // In a real environment we'd install iconv-lite. 
            // For now, let's hope for UTF-8 or that our user is OK with us just downloading images 
            // and maybe the text is readable enough or we can use a library if present.
            // Actually, to be safe, we should check if iconv-lite is available or just try TextDecoder with 'gbk' (Node 11+ supports it if full ICU)
            try {
                const decoder = new TextDecoder('gbk');
                html = decoder.decode(buffer);
            } catch (e) {
                console.warn("TextDecoder 'gbk' failed, falling back to utf-8");
            }
        }

        const content = cleanHtml(html);

        // Find all image refs
        const imgRegex = /\[IMAGE_REF: (.*?)\]/g;
        let match;
        let finalContent = content;

        while ((match = imgRegex.exec(content)) !== null) {
            const imgUrl = match[1];
            const imgName = path.basename(imgUrl).split('?')[0] || `image_${Date.now()}.jpg`;

            // Check if it's a valid http url
            if (imgUrl.startsWith('http')) {
                await downloadImage(imgUrl, imgName);
                finalContent = finalContent.replace(match[0], `[已下载图片: knowledge/futures_patterns/images/${imgName}]`);
            }
        }

        const outFile = path.join(OUTPUT_DIR, 'future_patterns_analysis.txt');
        fs.writeFileSync(outFile, `Source: ${ARTICLE_URL}\n\n${finalContent}`);
        console.log(`Saved analysis to: ${outFile}`);

    } catch (e) {
        console.error("Main Error:", e);
    }
};

main();
