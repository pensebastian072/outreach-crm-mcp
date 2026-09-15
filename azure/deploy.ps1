# Deploy Azure infrastructure for HQ Outreach MCP
# PowerShell deployment script

# Error handling
$ErrorActionPreference = "Stop"

Write-Host "=== Azure Infrastructure Deployment ===" -ForegroundColor Cyan
Write-Host ""

# Check if Azure CLI is installed
try {
    $azVersion = az --version
    if ($LASTEXITCODE -ne 0) {
        throw "Azure CLI not found"
    }
} catch {
    Write-Host "❌ Azure CLI is not installed. Please install it first:" -ForegroundColor Red
    Write-Host "   https://docs.microsoft.com/en-us/cli/azure/install-azure-cli" -ForegroundColor Yellow
    exit 1
}

# Check if logged in
Write-Host "Checking Azure login status..." -ForegroundColor Yellow
try {
    $account = az account show | ConvertFrom-Json
    $subscription = $account.name
    Write-Host "✅ Logged in to Azure" -ForegroundColor Green
    Write-Host "📋 Current subscription: $subscription" -ForegroundColor Cyan
} catch {
    Write-Host "❌ Not logged in to Azure. Please run: az login" -ForegroundColor Red
    exit 1
}
Write-Host ""

# Configuration
$RESOURCE_GROUP = "your-resource-group"
$LOCATION = "eastus"
$TEMPLATE_FILE = "main.bicep"
$PARAMETERS_FILE = "main.parameters.json"

# Ensure we're in the azure directory
Set-Location $PSScriptRoot

# Check if resource group exists, create if not
Write-Host "Checking if resource group '$RESOURCE_GROUP' exists..." -ForegroundColor Yellow
try {
    az group show --name $RESOURCE_GROUP | Out-Null
    Write-Host "✅ Resource group exists" -ForegroundColor Green
} catch {
    Write-Host "⚠️  Resource group does not exist. Creating..." -ForegroundColor Yellow
    az group create --name $RESOURCE_GROUP --location $LOCATION
    Write-Host "✅ Resource group created" -ForegroundColor Green
}
Write-Host ""

# Validate the template
Write-Host "Validating Bicep template..." -ForegroundColor Yellow
try {
    az deployment group validate `
        --resource-group $RESOURCE_GROUP `
        --template-file $TEMPLATE_FILE `
        --parameters $PARAMETERS_FILE | Out-Null
    Write-Host "✅ Template validation successful" -ForegroundColor Green
} catch {
    Write-Host "❌ Template validation failed" -ForegroundColor Red
    exit 1
}
Write-Host ""

# Deploy the template
Write-Host "Deploying infrastructure to Azure..." -ForegroundColor Yellow
Write-Host "This may take 5-10 minutes..." -ForegroundColor Cyan
Write-Host ""

# Generate deployment name with timestamp
$deploymentName = "main-$(Get-Date -Format 'yyyyMMdd-HHmmss')"

az deployment group create `
    --resource-group $RESOURCE_GROUP `
    --template-file $TEMPLATE_FILE `
    --parameters $PARAMETERS_FILE `
    --name $deploymentName `
    --output table

Write-Host ""
Write-Host "=== Deployment Complete ===" -ForegroundColor Cyan
Write-Host ""

# Get deployment outputs
Write-Host "📋 Deployment Details:" -ForegroundColor Cyan
try {
    $deployment = az deployment group show `
        --resource-group $RESOURCE_GROUP `
        --name $deploymentName | ConvertFrom-Json
    
    $webAppUrl = $deployment.properties.outputs.webAppUrl.value
    $stagingUrl = $deployment.properties.outputs.stagingSlotUrl.value
    $devUrl = $deployment.properties.outputs.devSlotUrl.value

    Write-Host ""
    Write-Host "🌐 Application URLs:" -ForegroundColor Green
    Write-Host "   Production:  https://$webAppUrl" -ForegroundColor White
    Write-Host "   Staging:     https://$stagingUrl" -ForegroundColor White
    Write-Host "   Development: https://$devUrl" -ForegroundColor White
} catch {
    Write-Host "⚠️  Could not retrieve deployment outputs" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "✅ Infrastructure deployment successful!" -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Cyan
Write-Host "1. Configure environment variables in Azure Portal" -ForegroundColor White
Write-Host "2. Set up GitHub secrets for CI/CD deployment" -ForegroundColor White
Write-Host "3. Deploy application code via GitHub Actions" -ForegroundColor White
Write-Host ""
Write-Host "For more information, see README.md" -ForegroundColor Yellow
