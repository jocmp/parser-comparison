import express from 'express';
import Mercury from '@postlight/parser';
import fetch from 'node-fetch';
import { JSDOM } from 'jsdom';
import path from 'path';
import { fileURLToPath } from 'url';
import { Defuddle } from 'defuddle/node';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(__dirname));

async function fetchPageContent(url, userAgent) {
    try {
        const urlObj = new URL(url);
        const origin = `${urlObj.protocol}//${urlObj.hostname}`;

        const response = await fetch(url, {
            headers: {
                'User-Agent': userAgent || 'Mozilla/5.0 (compatible; Parser-Comparison/1.0)',
                'Origin': origin,
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.5',
                'Accept-Encoding': 'gzip, deflate',
                'DNT': '1',
                'Connection': 'keep-alive'
            },
            follow: 5,
            timeout: 10000
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        return await response.text();
    } catch (error) {
        console.error('Fetch error:', error);
        throw error;
    }
}

async function parseWithDefuddle(html, originalUrl) {
    try {
        const dom = new JSDOM(html, { url: originalUrl });
        const result = await Defuddle(dom, originalUrl, {
            debug: false,
            markdown: false
        });

        return {
            title: result.title || 'No title found',
            content: result.content || 'No content found',
            url: result.url || originalUrl,
            author: result.author || 'Unknown',
            description: result.description || '',
            word_count: result.wordCount || 0,
            image: result.image || '',
            domain: result.domain || ''
        };
    } catch (error) {
        console.error('defuddle parsing error:', error);
        throw error;
    }
}

app.post('/api/parse', async (req, res) => {
    try {
        const { url, userAgent } = req.body;

        if (!url) {
            return res.status(400).json({ error: 'URL is required' });
        }

        try {
            new URL(url);
        } catch {
            return res.status(400).json({ error: 'Invalid URL provided' });
        }

        console.log(`Parsing URL: ${url}`);

        const fetchedContent = await fetchPageContent(url, userAgent);

        const [postlightResult, defuddleResult] = await Promise.allSettled([
            Mercury.parse(url),
            parseWithDefuddle(fetchedContent, url)
        ]);

        const response = {
            postlight: {
                success: postlightResult.status === 'fulfilled',
                data: postlightResult.status === 'fulfilled' ? postlightResult.value : null,
                error: postlightResult.status === 'rejected' ? postlightResult.reason.message : null
            },
            defuddle: {
                success: defuddleResult.status === 'fulfilled',
                data: defuddleResult.status === 'fulfilled' ? defuddleResult.value : null,
                error: defuddleResult.status === 'rejected' ? defuddleResult.reason.message : null
            }
        };

        res.json(response);

    } catch (error) {
        console.error('Parsing error:', error);
        res.status(500).json({
            error: 'Failed to parse URL',
            details: error.message
        });
    }
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
    console.log(`Parser comparison server running on http://localhost:${PORT}`);
});
