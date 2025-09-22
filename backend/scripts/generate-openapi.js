const fs = require('node:fs');
const path = require('node:path');
const openapiSpecification = require('../src/docs/openapi');

const outputPath = path.resolve(__dirname, '../docs/openapi.json');

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, JSON.stringify(openapiSpecification, null, 2));

console.log(`OpenAPI spec generated at ${outputPath}`);
