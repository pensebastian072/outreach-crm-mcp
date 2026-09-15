# Setup Guide

This guide walks you through setting up the HQ Outreach MCP project from scratch.

## Prerequisites

Before you begin, ensure you have:

- **Node.js LTS (20+)**: Download from [nodejs.org](https://nodejs.org/) (Node.js 22 recommended as of 2026)
- **npm**: Comes with Node.js
- **Git**: For cloning the repository
- **Azure App Registration**: For Microsoft Graph/Outlook integration (optional for testing)
- **Outlook Account**: For sending emails (optional for testing)

## Step-by-Step Setup

### 1. Clone the Repository

```bash
git clone https://github.com/penYOUR-USERNAME/outreach-crm-mcp.git
cd hq-outreach-mcp
```

### 2. Install Dependencies

**⚠️ IMPORTANT: This step is required before running any npm scripts!**

```bash
npm install
```

**Note:** Make sure to include a space between "npm" and "install". Do not type "npminstall" as a single word.

This command installs all required dependencies including:
- **Runtime dependencies**: `express`, `sqlite3`, `axios`, etc.
- **Development dependencies**: `tsx`, `typescript`, `ts-node`, etc.

**Common Error**: If you skip this step, you'll see errors like:
- `'tsx' is not recognized as an internal or external command`
- `Cannot find module 'express'`

### 3. Build the Project

Compile TypeScript to JavaScript:

```bash
npm run build
```

This creates the `dist/` directory with compiled JavaScript files.

### 4. Initialize the Database

Create the SQLite database:

```bash
# On Windows (PowerShell or CMD)
type schema.sql | sqlite3 ./data/outreach.db

# On macOS/Linux
sqlite3 ./data/outreach.db < schema.sql
```

If the `data/` directory doesn't exist, create it first:

```bash
mkdir data
```

If you are upgrading an existing database, run the latest migration:

```bash
sqlite3 ./data/outreach.db < scripts/migrate-20260202.sql
```

### 5. Configure Environment Variables

Create a `.env` file in the project root:

```bash
# On Windows
copy .env.template .env

# On macOS/Linux
cp .env.template .env
```

Edit `.env` and add your configuration:

```env
# Azure App Registration
TENANT_ID=your-azure-tenant-id
CLIENT_ID=your-azure-app-client-id

# Email Configuration
SENDER_UPN=your-outlook-email@example.com

# Calendly
THOMAS_CALENDLY_LINK=https://calendly.com/your-username

# Database
DATABASE_PATH=./data/outreach.db

# SharePoint Tracker (optional)
TRACKER_SHAREPOINT_SITE_ID=your-sharepoint-site-id
TRACKER_EXCEL_FILE_ID=your-excel-file-id
TRACKER_WORKSHEET_NAME=OutreachTracker
```

### 6. Set Up Azure App Registration (Optional)

If you want to use Outlook integration:

1. Go to [Azure Portal](https://portal.azure.com/) > App Registrations
2. Click "New Registration"
3. Set redirect URI to `http://localhost` (for device code flow)
4. Go to "API Permissions" and add:
   - `Mail.ReadWrite`
   - `Mail.Send`
   - `Sites.ReadWrite.All` (for SharePoint tracker)
5. Grant admin consent for the permissions
6. Copy the Tenant ID and Client ID to your `.env` file

## Verify Installation

### Run the Web Server

```bash
npm start
```

Open your browser to http://localhost:8080

You should see the dashboard with statistics.

### Run the MCP Server

```bash
npm run start:mcp
```

The MCP server will start and listen for tool requests.

### Run Tests

```bash
# Smoke test
npm test

# Batch tests (various sizes)
npm run batch-test:25
npm run batch-test
npm run batch-test:100
```

## Common Issues and Solutions

### Issue: `'tsx' is not recognized`

**Cause**: Dependencies not installed

**Solution**: Run `npm install`

### Issue: `Cannot find module 'express'`

**Cause**: Dependencies not installed

**Solution**: Run `npm install`

### Issue: `BUILD: Command failed with exit code 2`

**Cause**: TypeScript compilation errors

**Solution**: 
1. Check TypeScript version: `npx tsc --version`
2. Run `npm run build` and fix any type errors
3. Ensure all dependencies are installed

### Issue: Database errors

**Cause**: Database not initialized

**Solution**: 
1. Create data directory: `mkdir data`
2. Initialize database: `sqlite3 ./data/outreach.db < schema.sql`

### Issue: Azure authentication fails

**Cause**: Invalid Azure credentials or permissions

**Solution**:
1. Verify Tenant ID and Client ID in `.env`
2. Check API permissions in Azure Portal
3. Ensure redirect URI is set to `http://localhost`
4. Grant admin consent for permissions

## Development Workflow

### Development Mode (with auto-reload)

```bash
# Web server with hot reload
npm run dev

# MCP server with hot reload
npm run dev:mcp
```

### Building

```bash
npm run build
```

### Testing

```bash
# Run smoke test
npm test

# Run batch tests
npm run batch-test
npm run batch-test:25
npm run batch-test:100
```

### File Structure

```
hq-outreach-mcp/
├── src/                    # TypeScript source files
│   ├── index.ts           # MCP server entry point
│   ├── web-server.ts      # Web application entry point
│   └── ...
├── dist/                  # Compiled JavaScript (created by build)
├── data/                  # SQLite database
├── public/                # Static web assets
├── test-results/          # Batch test output
├── package.json           # Dependencies and scripts
├── tsconfig.json          # TypeScript configuration
├── schema.sql             # Database schema
└── .env                   # Environment variables (create from .env.template)
```

## Next Steps

- Read [HOW_TO_USE.md](HOW_TO_USE.md) for usage instructions
- Read [TEST_EMAILS_GUIDE.md](TEST_EMAILS_GUIDE.md) for testing email generation
- Read [DEPLOYMENT.md](DEPLOYMENT.md) for Azure deployment
- Read [README.md](README.md) for full feature documentation

## Getting Help

If you encounter issues not covered in this guide:

1. Check the Troubleshooting section in [README.md](README.md)
2. Review error messages carefully - they often indicate the exact problem
3. Ensure all prerequisites are installed and up to date
4. Verify your `.env` configuration matches the template
5. Open an issue on GitHub with:
   - Full error message
   - Steps to reproduce
   - Your Node.js version (`node --version`)
   - Your npm version (`npm --version`)
