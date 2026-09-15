#!/bin/bash
# Deploy Azure infrastructure for HQ Outreach MCP

set -e

echo "=== Azure Infrastructure Deployment ==="
echo ""

# Check if Azure CLI is installed
if ! command -v az &> /dev/null; then
    echo "❌ Azure CLI is not installed. Please install it first:"
    echo "   https://docs.microsoft.com/en-us/cli/azure/install-azure-cli"
    exit 1
fi

# Check if logged in
echo "Checking Azure login status..."
if ! az account show &> /dev/null; then
    echo "❌ Not logged in to Azure. Please run: az login"
    exit 1
fi

# Get current subscription
SUBSCRIPTION=$(az account show --query name -o tsv)
echo "✅ Logged in to Azure"
echo "📋 Current subscription: $SUBSCRIPTION"
echo ""

# Configuration
RESOURCE_GROUP="your-resource-group"
LOCATION="eastus"
TEMPLATE_FILE="main.bicep"
PARAMETERS_FILE="main.parameters.json"

# Ensure we're in the azure directory
cd "$(dirname "$0")"

# Check if resource group exists, create if not
echo "Checking if resource group '$RESOURCE_GROUP' exists..."
if ! az group show --name "$RESOURCE_GROUP" &> /dev/null; then
    echo "⚠️  Resource group does not exist. Creating..."
    az group create --name "$RESOURCE_GROUP" --location "$LOCATION"
    echo "✅ Resource group created"
else
    echo "✅ Resource group exists"
fi
echo ""

# Validate the template
echo "Validating Bicep template..."
if az deployment group validate \
    --resource-group "$RESOURCE_GROUP" \
    --template-file "$TEMPLATE_FILE" \
    --parameters "$PARAMETERS_FILE" > /dev/null; then
    echo "✅ Template validation successful"
else
    echo "❌ Template validation failed"
    exit 1
fi
echo ""

# Deploy the template
echo "Deploying infrastructure to Azure..."
echo "This may take 5-10 minutes..."
echo ""

# Generate deployment name with timestamp
DEPLOYMENT_NAME="main-$(date +%Y%m%d-%H%M%S)"

az deployment group create \
    --resource-group "$RESOURCE_GROUP" \
    --template-file "$TEMPLATE_FILE" \
    --parameters "$PARAMETERS_FILE" \
    --name "$DEPLOYMENT_NAME" \
    --output table

echo ""
echo "=== Deployment Complete ==="
echo ""

# Get deployment outputs
echo "📋 Deployment Details:"
WEB_APP_URL=$(az deployment group show \
    --resource-group "$RESOURCE_GROUP" \
    --name "$DEPLOYMENT_NAME" \
    --query properties.outputs.webAppUrl.value -o tsv 2>/dev/null || echo "N/A")
STAGING_URL=$(az deployment group show \
    --resource-group "$RESOURCE_GROUP" \
    --name "$DEPLOYMENT_NAME" \
    --query properties.outputs.stagingSlotUrl.value -o tsv 2>/dev/null || echo "N/A")
DEV_URL=$(az deployment group show \
    --resource-group "$RESOURCE_GROUP" \
    --name "$DEPLOYMENT_NAME" \
    --query properties.outputs.devSlotUrl.value -o tsv 2>/dev/null || echo "N/A")

echo ""
echo "🌐 Application URLs:"
echo "   Production: https://$WEB_APP_URL"
echo "   Staging:    https://$STAGING_URL"
echo "   Development: https://$DEV_URL"
echo ""

echo "✅ Infrastructure deployment successful!"
echo ""
echo "Next steps:"
echo "1. Configure environment variables in Azure Portal"
echo "2. Set up GitHub secrets for CI/CD deployment"
echo "3. Deploy application code via GitHub Actions"
echo ""
echo "For more information, see README.md"
