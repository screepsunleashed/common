/**
 * This file copies the required files into the dist directory
*/

const fs = require('fs');

// Read package json and remove the unneeded values
const pkg = JSON.parse(fs.readFileSync('./package.json').toString());
delete pkg['scripts'];
delete pkg['devDependencies'];

fs.writeFileSync('./dist/package.json', JSON.stringify(pkg, null, 4));
fs.copyFileSync('./LICENSE', './dist/LICENSE');