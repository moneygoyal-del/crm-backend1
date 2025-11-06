import axios from 'axios';
import fs from 'fs/promises';
import path from 'path';

// --- Configuration ---
const WEBHOOK_URL = process.env.GOOGLE_SHEET_WEBHOOK_URL;
const SECRET_TOKEN = process.env.GOOGLE_SHEET_SECRET_TOKEN;
const QUEUE_FILE_PATH = path.resolve('sheet_queue.json');
const RETRY_INTERVAL_MS = 2 * 60 * 1000; // 2 Minutes

let isProcessing = false; // A "lock" to prevent multiple workers running

/**
 * Loads the queue from the JSON file.
 * @returns {Promise<Array<Object>>} An array of jobs.
 */
const loadQueue = async () => {
    try {
        await fs.access(QUEUE_FILE_PATH);
        const data = await fs.readFile(QUEUE_FILE_PATH, 'utf-8');
        return JSON.parse(data);
    } catch (error) {
        // File doesn't exist, return empty queue
        return [];
    }
};

/**
 * Saves the entire queue back to the JSON file.
 * @param {Array<Object>} queue - The array of jobs to save.
 */
const saveQueue = async (queue) => {
    try {
        await fs.writeFile(QUEUE_FILE_PATH, JSON.stringify(queue, null, 2));
    } catch (error) {
        console.error("CRITICAL: Failed to save sheet queue!", error);
    }
};

/**
 * The main "worker" function.
 * Tries to process one job from the front of the queue.
 */
const processQueue = async () => {
    if (isProcessing) {
        console.log("Sheet Queue: Already processing. Skipping run.");
        return;
    }
    
    isProcessing = true;
    let queue = await loadQueue();

    if (queue.length === 0) {
        console.log("Sheet Queue: No jobs to process.");
        isProcessing = false;
        return;
    }

    // Get the oldest job (from the front of the array)
    const job = queue[0];
    
    console.log(`Sheet Queue: Processing job for ${job.type}... (${queue.length} total)`);

    const payload = {
        secret: SECRET_TOKEN,
        type: job.type,
        rowData: job.rowData
    };

    try {
        // --- Try to send the job to Google ---
        await axios.post(WEBHOOK_URL, payload, {
            headers: { 'Content-Type': 'application/json' }
        });

        // --- SUCCESS ---
        console.log("Sheet Queue: Job successful. Removing from queue.");
        queue.shift(); // Remove the job we just processed
        await saveQueue(queue);
        
        isProcessing = false;
        
        // If we succeeded, immediately try the next job
        if (queue.length > 0) {
            processQueue(); // Call self without waiting for interval
        }

    } catch (error) {
        // --- FAILURE ---
        if (axios.isAxiosError(error) && error.response?.status === 429) {
            // --- RATE LIMIT HIT (429) ---
            console.warn("Sheet Queue: Rate limit hit. Pausing worker. Job will be retried.");
            // We DO NOT save the queue, so the job stays at the front.
        } else {
            // --- OTHER ERROR (e.g., 500, 403) ---
            console.error("Sheet Queue: Job FAILED. Will retry later.", error.message);
            // We also DO NOT save, so the job stays and gets retried.
        }
        isProcessing = false;
    }
};

/**
 * Public function to add a new job to the queue.
 * This is called by your controllers.
 * @param {string} type - "OPD_BOOKING" or "DOCTOR_MEETING"
 * @param {Array<string>} rowData - The row data
 */
export const addToSheetQueue = async (type, rowData) => {
    if (!WEBHOOK_URL || !SECRET_TOKEN) {
        console.error("Sheet Queue: Missing .env vars. Job not added.");
        return;
    }
    
    const job = { type, rowData, addedAt: new Date().toISOString() };
    
    let queue = await loadQueue();
    queue.push(job);
    await saveQueue(queue);
    
    console.log("Sheet Queue: New job added. Total jobs:", queue.length);

    // If the queue isn't already processing, kick it off
    if (!isProcessing) {
        processQueue();
    }
};

/**
 * Starts the background timer that retries the queue.
 */
export const startSheetWorker = () => {
    console.log("Sheet Queue: Worker started. Will check for jobs every 2 minutes.");
    
    // Run it once on start, in case there are leftover jobs
    processQueue();

    // Then, set it to run on an interval
    setInterval(processQueue, RETRY_INTERVAL_MS);
};