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
  
  const tenDigitRegex = /^\d{10}$/;
  if (!tenDigitRegex.test(str)) {
      throw new apiError(400, "Provide a valid phone number");
  }
  return str;
}

/**
 * Returns the current Indian Standard Time (IST) as an ISO-like string.
 * Useful for saving "face-value" IST time into TIMESTAMP columns.
 * @param {number} [addMinutes=0] - Optional minutes to add to the current time.
 */
function getIndianTimeISO(addMinutes = 0) {
    const date = new Date();
    
    // Add minutes if provided (e.g., for OTP expiry)
    if (addMinutes) {
        date.setMinutes(date.getMinutes() + addMinutes);
    }

    // Shift UTC to IST (+5 hours 30 minutes)
    const istOffset = 5.5 * 60 * 60 * 1000; 
    const istDate = new Date(date.getTime() + istOffset);
    
    // Return ISO string but strip the 'Z' so DB treats it as local time value
    return istDate.toISOString().replace('Z', '');
}

// ... (parseTimestamp function can remain as is or be removed if unused) ...

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
      
      // MODIFIED: Create ISO string directly without forcing timezone conversion
      // This preserves the input time (e.g. 15:30) as 15:30 in the DB
      const formattedString = `${year}-${month}-${day}T${timePart ? timePart : "00:00:00"}`;
      
      // Verify it's a valid date
      if (isNaN(new Date(formattedString).getTime())) return null; 
      
      return formattedString;
  } catch (e) {
      return null;
  }
}

function convertDurationToMinutes(durationString) {
    if (typeof durationString !== 'string' || durationString === '-') return 0;
    const parts = durationString.split(':').map(Number);
    if (parts.length === 3) {
        const totalSeconds = parts[0] * 3600 + parts[1] * 60 + parts[2];
        return Math.ceil(totalSeconds / 60);
    }
    return 0;
}

function parseCallLogTimestamp(rawDateTimeString) {
    if (!rawDateTimeString || typeof rawDateTimeString !== 'string' || rawDateTimeString.trim() === '-') return null;

    try {
        const parts = rawDateTimeString.trim().split(/[\s/:]+/); 
        if (parts.length < 6) return null; 

        let [month, day, year, hour, minute, ampm] = parts;
        
        month = parseInt(month, 10);
        day = parseInt(day, 10);
        year = parseInt(year, 10);
        hour = parseInt(hour, 10);
        minute = parseInt(minute, 10);
        
        if (ampm && ampm.toUpperCase() === 'PM' && hour !== 12) {
            hour += 12;
        } else if (ampm && ampm.toUpperCase() === 'AM' && hour === 12) {
            hour = 0;
        }

        if (year < 100) year += 2000; 

        // Construct Date object assuming input is local/IST, shift it to preserve value
        // We construct a string manually to ensure the DB gets the exact numbers
        const pad = (n) => n.toString().padStart(2, '0');
        const isoString = `${year}-${pad(month)}-${pad(day)}T${pad(hour)}:${pad(minute)}:00`;
        
        return isoString;

    } catch (e) {
        return null;
    }
}

export { 
    processString, 
    process_phone_no, 
    processTimeStamp, 
    convertDurationToMinutes, 
    parseCallLogTimestamp,
    getIndianTimeISO 
};