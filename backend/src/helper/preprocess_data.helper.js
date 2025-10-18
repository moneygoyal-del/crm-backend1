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
  if (str.length != 10) throw new apiError("Provide a valid phone number");
  else return str = parseInt(str);
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
  if(!timeStamp)return null;
  const newTimeStamp = timeStamp.trim().replaceAll("/", "-");
  const dateSplit = newTimeStamp.split(" ");
  const date = dateSplit[0];
  const timePart = dateSplit[1];
  const dateParts = date.split('-');
  const day = dateParts[0];
  const month = dateParts[1];
  const year = dateParts[2];
  const formattedString = `${year}-${month}-${day}T${timePart?timePart:"05:30:00"}+05:30`;
  const timestamp = new Date(formattedString).toISOString();
  return timestamp;
}

export { processString, process_phone_no, parseTimestamp, processTimeStamp };