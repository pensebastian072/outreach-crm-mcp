#!/usr/bin/env node

/**
 * Post-installation script that provides next steps guidance
 */

console.log('\n✅ Dependencies installed successfully!\n');
console.log('📋 Next steps:\n');
console.log('   1. Build the project:');
console.log('      npm run build\n');
console.log('   2. Initialize the database:');
console.log('      mkdir -p data');
console.log('      sqlite3 ./data/outreach.db < schema.sql\n');
console.log('   3. Configure environment variables:');
console.log('      Copy .env.template to .env and update with your settings\n');
console.log('   4. Start the application:');
console.log('      npm start\n');
console.log('📖 For detailed setup instructions, see SETUP.md\n');
