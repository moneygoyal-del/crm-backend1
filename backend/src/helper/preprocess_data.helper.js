import apiError from "../utils/apiError.utils.js"

function processString(inputString) {
  if (typeof inputString !== 'string') {
    return '';
  }
  return inputString.toLowerCase().trim();
}

function process_phone_no(phone) {
  let str = "" + phone;
  str = str.replace(" ", "");
  str = str.replace("+91", "");
  str = str.trim();
  str = str.replace(" ", "");
  
  // Regex check for exactly 10 digits
  const tenDigitRegex = /^\d{10}$/;
  if (!tenDigitRegex.test(str)) {
     
      throw new apiError(400, "Provide a valid phone number");
  }
  
  // Return the phone number as a string (since it's a UUID reference, string format is safer)
  return str;
}


/**
 * Parses a date and time string from the CSV into a valid JavaScript Date object.
 * @param {string} dateTimeString - The combined date and time string (e.g., "13/10/2025 17:41:00").
 * @returns {Date|null} A Date object or null if the format is invalid.
 */
function parseTimestamp(dateTimeString) {
  if (!dateTimeString || typeof dateTimeString !== 'string') {
    return null;
  }

  // Split date and time parts
  const [datePart, timePart] = dateTimeString.trim().split(/\s+/);

  if (!datePart) {
    console.warn(`Invalid date format: ${dateTimeString}`);
    return null;
  }

  // Parse date: DD/MM/YYYY
  const dateParts = datePart.split('/');
  if (dateParts.length !== 3) {
    console.warn(`Invalid date part format: ${datePart}`);
    return null;
  }
  const day = parseInt(dateParts[0], 10);
  const month = parseInt(dateParts[1], 10) - 1; // JS month is 0-indexed
  const year = parseInt(dateParts[2], 10);

  // Parse time: HH:mm:ss (optional)
  let hour = 0, minute = 0, second = 0;
  if (timePart) {
    const timeParts = timePart.split(':');
    if (timeParts.length >= 2) { // Handle HH:mm and HH:mm:ss
      hour = parseInt(timeParts[0], 10);
      minute = parseInt(timeParts[1], 10);
      if (timeParts.length === 3) {
        second = parseInt(timeParts[2], 10);
      }
    }
  }

  if (isNaN(day) || isNaN(month) || isNaN(year) || isNaN(hour) || isNaN(minute) || isNaN(second)) {
    console.warn(`Could not parse date/time: ${dateTimeString}`);
    return null;
  }

  return new Date(year, month, day, hour, minute, second);
}

function processTimeStamp(timeStamp) {
  if(!timeStamp || typeof timeStamp !== 'string' || timeStamp.trim() === '') return null;
  
  try {
      const newTimeStamp = timeStamp.trim().replaceAll("/", "-");
      const dateSplit = newTimeStamp.split(" ");
      const date = dateSplit[0];
      const timePart = dateSplit[1];
      const dateParts = date.split('-');
      
      if (dateParts.length !== 3) return null;

      const day = dateParts[0];
      const month = dateParts[1];
      const year = dateParts[2];
      
      const formattedString = `${year}-${month}-${day}T${timePart ? timePart : "00:00:00"}+05:30`;
      
      const timestamp = new Date(formattedString).toISOString();
      
      if (isNaN(new Date(timestamp).getTime())) return null; 
      
      return timestamp;
  } catch (e) {
      return null;
  }
}

/**
 * Converts HH:mm:ss duration string to total minutes (rounded up).
 * Used for call logs insertion into doctor_meetings duration column.
 * @param {string} durationString - The duration string (e.g., "00:02:12").
 * @returns {number} Duration in minutes.
 */
function convertDurationToMinutes(durationString) {
    if (typeof durationString !== 'string' || durationString === '-') return 0;
    const parts = durationString.split(':').map(Number);
    // Assumes HH:mm:ss format (index 0: hours, 1: minutes, 2: seconds)
    if (parts.length === 3) {
        const totalSeconds = parts[0] * 3600 + parts[1] * 60 + parts[2];
        return Math.ceil(totalSeconds / 60); // Round up to the nearest minute for insertion
    }
    return 0;
}

/**
 * Parses MM/DD/YY HH:mm AM/PM format specifically for Call Log CSVs.
 * @param {string} rawDateTimeString - The date/time string (e.g., "03/10/25 03:01 PM").
 * @returns {string|null} ISO string or null if invalid.
 */
function parseCallLogTimestamp(rawDateTimeString) {
    if (!rawDateTimeString || typeof rawDateTimeString !== 'string' || rawDateTimeString.trim() === '-') return null;

    try {
        // Splits by space, /, and : to get all numerical and AM/PM parts
        const parts = rawDateTimeString.trim().split(/[\s/:]+/); 
        // Expected parts order: [MM, DD, YY, HH, mm, AM/PM]
        if (parts.length < 6) return null; 

        let [month, day, year, hour, minute, ampm] = parts;
        
        month = parseInt(month, 10);
        day = parseInt(day, 10);
        year = parseInt(year, 10);
        hour = parseInt(hour, 10);
        minute = parseInt(minute, 10);
        
        // Convert 12-hour AM/PM to 24-hour time
        if (ampm && ampm.toUpperCase() === 'PM' && hour !== 12) {
            hour += 12;
        } else if (ampm && ampm.toUpperCase() === 'AM' && hour === 12) {
            hour = 0;
        }

        // Handle 2-digit year (YYYY)
        if (year < 100) {
            // Assume 21st century for years like '25'
            year += 2000; 
        }

        // Create a Date object using YYYY, MM (0-indexed), DD, HH, mm, ss
        const dateObject = new Date(year, month - 1, day, hour, minute, 0);

        if (isNaN(dateObject.getTime())) {
            return null; // Invalid date
        }
        
        return dateObject.toISOString();

    } catch (e) {
        // Fallback for unexpected characters or parsing failure
        return null;
    }
}


export { processString, process_phone_no, parseTimestamp, processTimeStamp, convertDurationToMinutes, parseCallLogTimestamp };
