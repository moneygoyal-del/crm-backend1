import apiError from "../utils/apiError.utils.js"

function processString(inputString) {
  if (typeof inputString !== 'string') {
    return '';
  }
  return inputString.toLowerCase().trim();
}

function process_phone_no(phone){
  let str = "" + phone;
  str = str.replace(" ","");
  str = str.replace("+91","");
  str = str.trim();
  str = str.replace(" ","");
  if(str.length!=10)throw new apiError("Provide a valid phone number");
  else return str = parseInt(str);
}
export {processString,process_phone_no};