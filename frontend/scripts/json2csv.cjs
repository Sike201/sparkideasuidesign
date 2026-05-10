const fs = require('fs');
const path = require('path');

function jsonToCsv(jsonFilePath) {
  // Parse the JSON file path and get the file name without extension
  const fileName = path.basename(jsonFilePath, path.extname(jsonFilePath));
  const csvFilePath = path.join(path.dirname(jsonFilePath), `${fileName}.csv`);

  // Read and parse JSON file
  const jsonData = JSON.parse(fs.readFileSync(jsonFilePath, 'utf8'));

  // Extract headers (keys) from the first object in the JSON array
  const headers = Object.keys(jsonData[0]);

  // Create CSV rows
  const csvRows = jsonData.map(obj =>
    headers.map(header => JSON.stringify(obj[header] ?? '')).join(',')
  );

  // Combine headers and rows, separating each row by a newline
  const csvData = [headers.join(','), ...csvRows].join('\n');

  // Write CSV to file
  fs.writeFileSync(csvFilePath, csvData, 'utf8');
  console.log(`CSV file has been created: ${csvFilePath}`);
}

// Check for the JSON file path argument
const jsonFilePath = process.argv[2];
if (!jsonFilePath) {
  console.error('Please provide a path to a JSON file.');
  process.exit(1);
}

// Convert JSON to CSV
jsonToCsv(jsonFilePath);
