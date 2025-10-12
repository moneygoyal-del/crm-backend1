import { createReadStream } from 'fs';
import { createInterface } from 'readline';

export default async function readCsvFile(filePath,skipFirstLine = true) {
  const fileStream = createReadStream(filePath);
  const rl = createInterface({
    input: fileStream,
    crlfDelay: Infinity // Handle all kinds of line endings
  });

  const data = [];

  for await (const line of rl) {
    if (skipFirstLine) {
      skipFirstLine = false;
      continue;
    }
    const row = line.split(',');
    data.push(row);
  }
  return data;
}