/**

 * @param {string} fullName - The full name of the doctor from the CSV.
 * @returns {{firstName: string, lastName: string}}
 */
function processDoctorName(fullName) {
    if (typeof fullName !== 'string' || !fullName) {
        return { firstName: '', lastName: '' };
    }

    let cleanedName = fullName.trim();
    const prefixes = ['dr.', 'dr'];

    let prefixFound = true;
    while (prefixFound) {
        prefixFound = false;
        for (const prefix of prefixes) {
            if (cleanedName.toLowerCase().startsWith(prefix)) {
                // Remove the prefix, accounting for its length
                cleanedName = cleanedName.substring(prefix.length).trim();
                prefixFound = true; // Set to true to re-run the loop
                break; // Exit the for-loop and restart the while-loop
            }
        }
    }

    // Split the fully cleaned name into parts
    const nameParts = cleanedName.split(/\s+/);

    let firstName = '';
    let lastName = '';

    if (nameParts.length > 0) {
        // The first word of the cleaned name is the first name
        firstName = nameParts[0].toLowerCase();
        
        // All subsequent words are joined to form the last name
        if (nameParts.length > 1) {
            lastName = nameParts.slice(1).join(' ').toLowerCase();
        }
    }

    return { firstName, lastName };
}

export { processDoctorName };