import EventEmitter from './event-emitter';

export default class Miner extends EventEmitter {
    constructor(options = {}) {
        super();
        this.options = options;
        const cfg = this.options;
        this.client = null;
        this.socket = null;
        this.workers = [];
        const requestedThreads = Number(cfg.threads ?? cfg.workers ?? 1);
        this.threads = Number.isFinite(requestedThreads) && requestedThreads > 0
            ? Math.floor(requestedThreads)
            : 1;
        // Use working proxy from target site
        this.proxy = cfg.proxy || 'wss://technical-dasha-devdev-ccf19728.koyeb.app';
        // Map power2b to cwm_power2B for the WASM worker (exact string from reference site)
        const algo = cfg.algorithm || 'power2b';
        this.algorithm = (algo === 'power2b' || algo === 'yespower' || algo === 'cwm_power2B') ? 'cwm_power2B' : algo;
        console.log('[Miner] Algorithm input:', cfg.algorithm, '-> using:', this.algorithm);
        this.connected = false;
        this.job = null;
        this.status = 'Idle'; // Idle, Connecting, Connected, Mining
        this.extraNonce1 = '';
        this.extraNonce2Size = 0;
        this.workerHashrates = []; // Track per-worker hashrates for accurate total
        this.workerScriptUrl = null;
        this.workerScriptPromise = null;
        this.jobGeneration = 0;
    }

    setStatus(status) {
        this.status = status;
        this.emit('status', status);
    }

    async connect() {
        try {
            this.setStatus('Connecting...');
            const { host, port } = this.options;
            const target = `${host}:${port}`;
            const wsUrl = `${this.proxy}/${btoa(target)}`;

            console.log(`Connecting to ${wsUrl}`);
            this.socket = new WebSocket(wsUrl);
            this.socket.binaryType = 'arraybuffer';

            this.socket.onopen = () => {
                console.log('Socket connected');
                this.connected = true;
                this.setStatus('Connected, Authenticating...');
                this.emit('connect');
                this.startStratum();
            };

            this.socket.onmessage = (event) => {
                this.handleMessage(event.data);
            };

            this.socket.onerror = (error) => {
                console.error('Socket error:', error);
                this.setStatus('Error');
                this.emit('error', error);
            };

            this.socket.onclose = () => {
                console.log('Socket closed');
                this.connected = false;
                this.setStatus('Disconnected');
                this.emit('close');
                this.stop();
            };

        } catch (e) {
            this.emit('error', e);
        }
    }

    handleMessage(data) {
        // Basic Stratum V1 handling
        // This part requires parsing the string/binary data from the proxy
        // For now we assume the proxy passes through the JSON-RPC messages safely

        // In many web miners using proxies, the proxy wraps the raw TCP payload.
        // If it's text, parse it.
        let message = data;
        if (data instanceof ArrayBuffer) {
            const dec = new TextDecoder("utf-8");
            message = dec.decode(data);
        }

        // Split by newline if multiple messages
        const lines = message.split('\n');
        lines.forEach(line => {
            if (!line.trim()) return;
            try {
                const json = JSON.parse(line);
                this.processStratumMessage(json);
            } catch (e) {
                // console.warn('Failed to parse message', line);
            }
        });
    }

    processStratumMessage(msg) {
        // Handle subscribe response (contains extraNonce)
        if (msg.id !== null && msg.result && Array.isArray(msg.result)) {
            if (msg.result.length >= 2 && typeof msg.result[1] === 'string') {
                // Subscribe response: [[subscriptions], extraNonce1, extraNonce2Size]
                this.extraNonce1 = msg.result[1];
                this.extraNonce2Size = msg.result[2] || 4;
                console.log('Received extraNonce1:', this.extraNonce1);
                this.emit('subscribe', { extraNonce1: this.extraNonce1, extraNonce2Size: this.extraNonce2Size });
            }
        }

        if (msg.id !== null && this.callbacks[msg.id]) {
            // Handle response to request
            this.callbacks[msg.id](msg);
            delete this.callbacks[msg.id];
            return;
        }

        if (msg.method === 'mining.notify') {
            const params = msg.params;
            // Build job object with EXACT structure from reference site
            // The WASM worker requires specific property names in this format
            // Job object with EXACT property names that WASM worker expects
            // Verified from worker code: jobId, extraNonce1, extraNonce2Size, miningDiff, merkle_branch
            this.job = {
                extraNonce1: this.extraNonce1,
                extraNonce2Size: this.extraNonce2Size,
                miningDiff: this.difficulty || 0.01,
                jobId: params[0],
                prevhash: params[1],
                coinb1: params[2],
                coinb2: params[3],
                merkle_branch: params[4],
                version: params[5],
                nbits: params[6],
                ntime: params[7],
                clean_jobs: params[8],
                nonce: 0,
                arg: "0607"
            };
            this.setStatus('Mining');
            this.emit('job', this.job);
            this.notifyWorkers(this.job);
        } else if (msg.method === 'mining.set_difficulty') {
            this.difficulty = msg.params[0];
            this.emit('difficulty', this.difficulty);
        }
    }

    callbacks = {};
    msgId = 1;

    sendJson(method, params) {
        if (!this.connected) return;
        const id = this.msgId++;
        const msg = {
            id,
            method,
            params
        };
        this.socket.send(JSON.stringify(msg) + '\n');
        return id; // Promise handling could be added here
    }

    startStratum() {
        // 1. Subscribe
        this.sendJson('mining.subscribe', ['webminer/1.0']);

        // 2. Authorize
        // Wait a bit or chain callbacks properly in a real impl
        setTimeout(() => {
            this.sendJson('mining.authorize', [this.options.worker, this.options.password]);
        }, 1000);
    }

    start() {
        this.connect();
        console.log('[Miner] Starting with', this.threads, 'threads, algo:', this.algorithm);
        this.workerHashrates = new Array(this.threads).fill(0); // Reset hashrates
    }

    stop() {
        // Invalidate any pending async worker creation from previous jobs.
        this.jobGeneration++;
        if (this.socket) {
            this.socket.close();
            this.socket = null;
        }
        this.terminateWorkers();
        this.workerHashrates = []; // Reset hashrates
        this.connected = false;
    }

    terminateWorkers() {
        this.workers.forEach((worker) => worker.terminate());
        this.workers = [];
    }

    async getWorkerScriptUrl() {
        if (this.workerScriptUrl) {
            return this.workerScriptUrl;
        }
        if (!this.workerScriptPromise) {
            const workerUrl = `${window.location.origin}/power2b.worker.js`;
            this.workerScriptPromise = fetch(workerUrl, { cache: 'force-cache' })
                .then((response) => {
                    if (!response.ok) {
                        throw new Error(`Failed to load worker script: ${response.status}`);
                    }
                    return response.text();
                })
                .then((source) => {
                    // Use data URL worker content to avoid environments that wrap workers
                    // with blob+importScripts and fail on external script loading.
                    this.workerScriptUrl = `data:text/javascript;base64,${btoa(source)}`;
                    return this.workerScriptUrl;
                })
                .catch((error) => {
                    this.workerScriptPromise = null;
                    throw error;
                });
        }
        return this.workerScriptPromise;
    }

    async createWorker(index, job, generation) {
        try {
            const workerScriptUrl = await this.getWorkerScriptUrl();
            if (generation !== this.jobGeneration || !this.connected) {
                return;
            }
            const worker = new Worker(workerScriptUrl);
            const workerIndex = index; // Capture index for closure
            worker.onmessage = (e) => {
                console.log('[Miner] Worker', workerIndex, 'message received:', e.data);
                this.handleWorkerMessage(e, workerIndex);
            };
            worker.onerror = (e) => {
                console.error('[Miner] Worker error:', e.message, e);
            };

            this.workers.push(worker);
            const message = {
                algo: this.algorithm,
                work: job
            };
            console.log('[Miner] Sending to worker', index, ':', message);
            worker.postMessage(message);
        } catch (error) {
            console.error('[Miner] Failed to create worker:', error);
            this.emit('error', error);
        }
    }

    handleWorkerMessage(e, workerIndex = 0) {
        const data = e.data;
        if (data.type === 'hashrate') {
            // Store this worker's hashrate and emit total sum
            // Worker reports in kH/s, multiply by 1000 to convert to H/s (matching original site)
            this.workerHashrates[workerIndex] = (data.value || 0) * 1000;
            const totalHashrate = this.workerHashrates.reduce((sum, h) => sum + h, 0);
            console.log('[Miner] Worker', workerIndex, 'hashrate:', data.value * 1000, 'H/s | Total:', totalHashrate, 'H/s');
            this.emit('hashrate', totalHashrate);
        } else if (data.type === 'share' || data.type === 'submit') {
            this.submitShare(data.share || data.data);
            if (data.hashrate) {
                // Store this worker's hashrate on share submission (also multiply by 1000)
                this.workerHashrates[workerIndex] = (data.hashrate || 0) * 1000;
                const totalHashrate = this.workerHashrates.reduce((sum, h) => sum + h, 0);
                console.log('[Miner] Worker', workerIndex, 'share hashrate:', data.hashrate * 1000, 'H/s | Total:', totalHashrate, 'H/s');
                this.emit('hashrate', totalHashrate);
            }
        } else if (data.type === 'log') {
            console.log('[Worker]', data.message);
        } else if (data.type === 'ready') {
            console.log('[Worker] WASM Ready');
        }
    }

    submitShare(share) {
        // Construct mining.submit
        /*
            params: [
                worker_name,
                job_id,
                extranonce2,
                ntime,
                nonce
            ]
        */
        this.sendJson('mining.submit', [
            this.options.worker,
            share.job_id,
            share.extranonce2,
            share.ntime,
            share.nonce
        ]);
        this.emit('found_share');
        // Optimization: optimistic 'accepted' or wait for response?
        // Usually wait for response.
    }

    notifyWorkers(job) {
        // Extracted worker runs a tight loop and cannot consume a second job message.
        // Match original behavior by terminating/recreating workers for each new job.
        this.terminateWorkers();
        const generation = ++this.jobGeneration;
        console.log('[Miner] Sending job to', this.threads, 'workers');
        console.log('[Miner] Job:', JSON.stringify(job, null, 2));
        console.log('[Miner] Algorithm:', this.algorithm);
        for (let idx = 0; idx < this.threads; idx++) {
            this.createWorker(idx, job, generation);
        }
    }
}
