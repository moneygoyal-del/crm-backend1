import axios from 'axios';

/**
 * Sends data to our Google Sheet webhook asynchronously.
 * @param {string} type - "OPD_BOOKING" or "DOCTOR_MEETING"
 * @param {Array<string>} rowData - An array of values in the exact order the sheet expects.
 */
export const logToGoogleSheet = (type, rowData) => {
    
    const WEBHOOK_URL = process.env.GOOGLE_SHEET_WEBHOOK_URL;
    const SECRET_TOKEN = process.env.GOOGLE_SHEET_SECRET_TOKEN;

    if (!WEBHOOK_URL) {
        console.error("GOOGLE_SHEET_WEBHOOK_URL is not set. Skipping sheet log.");
        return;
    }
    if (!SECRET_TOKEN) {
        console.error("GOOGLE_SHEET_SECRET_TOKEN is not set. Skipping sheet log.");
        return;
    }

    const payload = {
        secret: SECRET_TOKEN,
        type: type,
        rowData: rowData
    };

    const config = {
        headers: {
            'Content-Type': 'application/json'
        }
        // maxRedirects: 0  <-- THIS LINE HAS BEEN REMOVED
    };

    axios.post(WEBHOOK_URL, payload, config)
        .then(response => {
            // After following the redirect, the final response should be a 200 OK
            // from the new URL, with our success message.
            console.log(`Google Sheet Log (${type}): ${response.data.message}`);
        })
        .catch(error => {
            if (error.response) {
                console.error(`Google Sheet Log (${type}) FAILED: Status ${error.response.status}.`, error.response.data);
            } else {
                console.error(`Google Sheet Log (${type}) FAILED:`, error.message);
            }
        });
};