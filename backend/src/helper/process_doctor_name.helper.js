/**
 
 * @param {string} fullName - The full name of the doctor.
 * @returns {{firstName: string, lastName: string}}
 */
function processDoctorName(fullName) {
    
    console.log(`\n--- Processing Name ---`);
    if (typeof fullName !== 'string' || !fullName) {
        console.log(`Input: "${fullName}" -> Invalid. Returning empty.`);
        return { firstName: '', lastName: '' };
    }
    console.log(`Input Name: "${fullName}"`);
   

    let nameParts = fullName.trim().split(/\s+/);

    
    const firstPart = nameParts[0].toLowerCase();
    if (firstPart === 'dr' || firstPart === 'dr.') {
        nameParts.shift(); 
        console.log(`Prefix found and removed.`);
    }

  
    const cleanedName = nameParts.join(' ');
    const finalParts = cleanedName.trim().split(/\s+/);

    let firstName = '';
    let lastName = '';

    if (finalParts.length === 1) {
        firstName = finalParts[0].toLowerCase();
    } else if (finalParts.length > 1) {
       
        firstName = finalParts[0].toLowerCase();
       
        lastName = finalParts.slice(1).join(' ').toLowerCase();
    }

    console.log(`Output -> firstName: "${firstName}", lastName: "${lastName}"`);
    return { firstName, lastName };
}

export { processDoctorName };