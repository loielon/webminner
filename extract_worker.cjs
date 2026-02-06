// Script to extract Power2b worker from target site
const https = require('https');
const fs = require('fs');

const url = 'https://webminer.pages.dev/js/app.aeaa8fab.js';

https.get(url, (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
        // Find the base64 encoded worker data
        const match = data.match(/const\s+dU\s*=\s*"data:text\/javascript;base64,([A-Za-z0-9+/=]+)"/);
        if (match) {
            const base64Data = match[1];
            const workerCode = Buffer.from(base64Data, 'base64').toString('utf8');
            fs.writeFileSync('public/power2b.worker.js', workerCode);
            console.log('Extracted worker to public/power2b.worker.js');
            console.log('First 500 chars:', workerCode.substring(0, 500));
        } else {
            console.log('Worker data not found');
            // Try alternative pattern
            const alt = data.match(/"data:text\/javascript;base64,([A-Za-z0-9+/=]{1000,})"/);
            if (alt) {
                const base64Data = alt[1];
                const workerCode = Buffer.from(base64Data, 'base64').toString('utf8');
                fs.writeFileSync('public/power2b.worker.js', workerCode);
                console.log('Extracted worker using alt pattern');
            }
        }
    });
}).on('error', err => console.error(err));
