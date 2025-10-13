import fs from 'fs';
import csv from 'csv-parser';

/**
 * Reads a CSV file using a robust parser that handles quoted commas.
 * This function now returns a Promise.
 * @param {string} filePath - The path to the CSV file.
 * @returns {Promise<Array<Array<string>>>} A promise that resolves with the CSV data as an array of rows.
 */
export default function readCsvFile(filePath) {
    return new Promise((resolve, reject) => {
        const data = [];
        fs.createReadStream(filePath)
            // Use the csv-parser library which correctly handles complex CSV rules
            .pipe(csv({ headers: false })) // Treat each row as an array of values, not an object
            .on('data', (row) => {
                // The library returns an object {'0': val1, '1': val2}, so we convert it back to a simple array
                data.push(Object.values(row));
            })
            .on('end', () => {
                // The original logic skipped the header row.
                // Our current parser includes it as the first item, so we remove it here.
                data.shift(); 
                console.log('CSV file successfully and robustly parsed.');
                resolve(data);
            })
            .on('error', (error) => {
                // If there's an error reading the file, reject the promise
                reject(error);
            });
    });
}