#!/usr/bin/env node

/**
 * Pre-flight check script to ensure dependencies are installed
 * before running npm scripts that require them.
 */

const fs = require('fs');
const path = require('path');

const projectRoot = path.join(__dirname, '..');
const nodeModulesPath = path.join(projectRoot, 'node_modules');

/**
 * Prints a boxed npm install command with proper formatting
 */
function printInstallCommand() {
  console.error('╔════════════════════════════════════════╗');
  console.error('║                                        ║');
  console.error('║           npm install                  ║');
  console.error('║                                        ║');
  console.error('╚════════════════════════════════════════╝\n');
  console.error('⚠️  IMPORTANT: Make sure to include a space between "npm" and "install"\n');
}

// Check if node_modules exists
if (!fs.existsSync(nodeModulesPath)) {
  console.error('\n❌ ERROR: Dependencies not installed!\n');
  console.error('The node_modules directory is missing.');
  console.error('\n📦 Please run the following command to install dependencies:\n');
  printInstallCommand();
  console.error('For detailed setup instructions, see SETUP.md\n');
  process.exit(1);
}

// Check for critical dependencies that are commonly needed
// Note: This list is intentionally hardcoded to check only the most critical packages
// that users are most likely to encounter errors with. This avoids the overhead of
// reading and parsing package.json for every script execution.
const criticalDeps = [
  'express',
  'tsx',
  'typescript',
  'sqlite3'
];

const missingDeps = [];

for (const dep of criticalDeps) {
  const depPath = path.join(nodeModulesPath, dep);
  if (!fs.existsSync(depPath)) {
    missingDeps.push(dep);
  }
}

if (missingDeps.length > 0) {
  console.error('\n❌ ERROR: Some critical dependencies are missing!\n');
  console.error('Missing packages:', missingDeps.join(', '));
  console.error('\n📦 Please run the following command to install dependencies:\n');
  printInstallCommand();
  console.error('For detailed setup instructions, see SETUP.md\n');
  process.exit(1);
}

// All checks passed
console.log('✓ Dependencies check passed');
process.exit(0);
