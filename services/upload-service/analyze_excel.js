const xlsx = require('xlsx');

// Load the file
const workbook = xlsx.readFile('test_rates.xlsx');
const sheetName = workbook.SheetNames[0];
const sheet = workbook.Sheets[sheetName];

// Convert to JSON with headers
const rawData = xlsx.utils.sheet_to_json(sheet, { header: 1 });

if (rawData.length === 0) {
    console.log("File is empty.");
} else {
    console.log(`Sheet: ${sheetName}`);
    console.log("Headers:", rawData[0]);
    console.log("\nFirst 3 rows of data:");
    rawData.slice(1, 4).forEach((row, i) => {
        console.log(`Row ${i + 1}:`, row);
    });
}
