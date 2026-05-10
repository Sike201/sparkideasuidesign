import * as fs from 'fs'
import * as path from 'path'

function csvToJson(csv) {
  const [headerLine, ...rows] = csv.trim().split("\r\n");

  const headers = headerLine.split(",");

  const jsonArray = rows
    .filter(row => row.trim() !== "") // Eliminate empty rows
    .map(row => {
      const values = row.split(",");
      const jsonObject = {};

      headers.forEach((header, index) => {
        jsonObject[header] = values[index];
      });

      return jsonObject;
    });

  return jsonArray;
}

// Check for a file path argument
if (process.argv.length < 3) {
  console.error("Please provide a CSV file path as an argument.");
  process.exit(1);
}

const csvFilePath = process.argv[2];
const jsonFilePath = path.join(
  path.dirname(csvFilePath),
  `${path.basename(csvFilePath, ".csv")}.json`
);

// Read CSV file
fs.readFile(csvFilePath, "utf8", (err, data) => {
  if (err) {
    console.error("Error reading the CSV file:", err);
    return;
  }

  // Convert CSV to JSON
  const json = csvToJson(data);

  const file = { rows: json }

  // Write JSON to file
  fs.writeFile(jsonFilePath, JSON.stringify(file, null, 2), "utf8", err => {
    if (err) {
      console.error("Error writing JSON file:", err);
    } else {
      console.log(`JSON data saved to ${jsonFilePath}`);
    }
  });
});
