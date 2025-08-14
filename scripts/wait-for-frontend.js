#!/usr/bin/env node

import http from 'http';
import chalk from 'chalk';

const FRONTEND_URL = process.env.CYPRESS_BASE_URL || 'http://localhost:3000';
const MAX_RETRIES = 30;
const RETRY_DELAY = 2000;

console.log(chalk.blue(`🔍 Waiting for frontend at ${FRONTEND_URL}...`));

let retries = 0;

function checkFrontend() {
    const url = new URL(FRONTEND_URL);
    
    const options = {
        hostname: url.hostname,
        port: url.port || (url.protocol === 'https:' ? 443 : 80),
        path: '/',
        method: 'GET',
        timeout: 5000
    };

    const req = http.request(options, (res) => {
        if (res.statusCode && res.statusCode < 500) {
            console.log(chalk.green(`✅ Frontend is ready at ${FRONTEND_URL}`));
            process.exit(0);
        } else {
            retry(`Frontend returned status ${res.statusCode}`);
        }
    });

    req.on('error', (err) => {
        retry(`Connection failed: ${err.message}`);
    });

    req.on('timeout', () => {
        req.destroy();
        retry('Request timeout');
    });

    req.end();
}

function retry(reason) {
    retries++;
    
    if (retries >= MAX_RETRIES) {
        console.error(chalk.red(`❌ Frontend not available after ${MAX_RETRIES} attempts`));
        console.error(chalk.red(`   Last error: ${reason}`));
        process.exit(1);
    }
    
    console.log(chalk.yellow(`   Attempt ${retries}/${MAX_RETRIES}: ${reason}. Retrying in ${RETRY_DELAY / 1000}s...`));
    setTimeout(checkFrontend, RETRY_DELAY);
}

// Start checking
checkFrontend();