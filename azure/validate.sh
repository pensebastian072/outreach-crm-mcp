#!/bin/bash
# Validation script to check Azure deployment slot configuration
# Run this after deploying infrastructure to verify everything is set up correctly

set -e

echo "=== Azure Deployment Slot Validation ==="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
RESOURCE_GROUP="your-resource-group"
WEB_APP_NAME="your-app-name"
EXPECTED_SLOTS=("staging" "ecb0fqahaebtd6g9")

# Check if Azure CLI is installed
if ! command -v az &> /dev/null; then
    echo -e "${RED}❌ Azure CLI is not installed${NC}"
    echo "Please install it from: https://docs.microsoft.com/en-us/cli/azure/install-azure-cli"
    exit 1
fi

# Check if logged in
echo "Checking Azure login status..."
if ! az account show &> /dev/null; then
    echo -e "${RED}❌ Not logged in to Azure${NC}"
    echo "Please run: az login"
    exit 1
fi

SUBSCRIPTION=$(az account show --query name -o tsv)
echo -e "${GREEN}✅ Logged in to Azure${NC}"
echo "   Subscription: $SUBSCRIPTION"
echo ""

# Check if resource group exists
echo "Validating resource group..."
if ! az group show --name "$RESOURCE_GROUP" &> /dev/null; then
    echo -e "${RED}❌ Resource group '$RESOURCE_GROUP' not found${NC}"
    echo "   Run: cd azure && ./deploy.sh"
    exit 1
fi
echo -e "${GREEN}✅ Resource group exists${NC}"
echo ""

# Check if web app exists
echo "Validating web app..."
if ! az webapp show --resource-group "$RESOURCE_GROUP" --name "$WEB_APP_NAME" &> /dev/null; then
    echo -e "${RED}❌ Web app '$WEB_APP_NAME' not found${NC}"
    echo "   Run: cd azure && ./deploy.sh"
    exit 1
fi

WEB_APP_STATE=$(az webapp show \
    --resource-group "$RESOURCE_GROUP" \
    --name "$WEB_APP_NAME" \
    --query state -o tsv)
echo -e "${GREEN}✅ Web app exists${NC}"
echo "   Name: $WEB_APP_NAME"
echo "   State: $WEB_APP_STATE"
echo ""

# Check deployment slots
echo "Validating deployment slots..."
SLOTS=$(az webapp deployment slot list \
    --resource-group "$RESOURCE_GROUP" \
    --name "$WEB_APP_NAME" \
    --query "[].name" -o tsv)

if [ -z "$SLOTS" ]; then
    echo -e "${RED}❌ No deployment slots found${NC}"
    echo "   Run: cd azure && ./deploy.sh"
    exit 1
fi

echo -e "${GREEN}✅ Deployment slots found:${NC}"
SLOTS_FOUND=true
for expected_slot in "${EXPECTED_SLOTS[@]}"; do
    if echo "$SLOTS" | grep -q "^${expected_slot}$"; then
        echo -e "   ${GREEN}✓${NC} $expected_slot"
    else
        echo -e "   ${RED}✗${NC} $expected_slot (missing)"
        SLOTS_FOUND=false
    fi
done
echo ""

if [ "$SLOTS_FOUND" = false ]; then
    echo -e "${RED}❌ Some required slots are missing${NC}"
    echo "   Run: cd azure && ./deploy.sh"
    exit 1
fi

# Check slot URLs
echo "Deployment slot URLs:"
for slot in $SLOTS; do
    SLOT_URL=$(az webapp deployment slot show \
        --resource-group "$RESOURCE_GROUP" \
        --name "$WEB_APP_NAME" \
        --slot "$slot" \
        --query defaultHostName -o tsv)
    echo "   $slot: https://$SLOT_URL"
done

PROD_URL=$(az webapp show \
    --resource-group "$RESOURCE_GROUP" \
    --name "$WEB_APP_NAME" \
    --query defaultHostName -o tsv)
echo "   production: https://$PROD_URL"
echo ""

# Check environment variables for staging slot
echo "Checking staging slot configuration..."
STAGING_CONFIG=""
if STAGING_CONFIG=$(az webapp config appsettings list \
    --resource-group "$RESOURCE_GROUP" \
    --name "$WEB_APP_NAME" \
    --slot staging \
    --query "[?name=='NODE_ENV' || name=='PORT' || name=='DATABASE_PATH'].{Name:name, Value:value}" -o table 2>&1); then
    if [ -n "$STAGING_CONFIG" ] && [ "$STAGING_CONFIG" != "[]" ]; then
        echo -e "${GREEN}✅ Staging slot has environment variables:${NC}"
        echo "$STAGING_CONFIG"
    else
        echo -e "${YELLOW}⚠️  Staging slot environment variables not configured${NC}"
        echo "   Configure in Azure Portal or see DEPLOYMENT.md"
    fi
else
    echo -e "${YELLOW}⚠️  Could not retrieve staging slot configuration${NC}"
    echo "   Error: $STAGING_CONFIG"
    echo "   Configure in Azure Portal or see DEPLOYMENT.md"
fi
echo ""

# Summary
echo "=== Validation Summary ==="
echo -e "${GREEN}✅ Resource group: $RESOURCE_GROUP${NC}"
echo -e "${GREEN}✅ Web app: $WEB_APP_NAME ($WEB_APP_STATE)${NC}"
echo -e "${GREEN}✅ Deployment slots: ${#EXPECTED_SLOTS[@]} configured${NC}"
echo ""

if [ -z "$STAGING_CONFIG" ]; then
    echo -e "${YELLOW}⚠️  Next steps:${NC}"
    echo "   1. Configure environment variables in Azure Portal"
    echo "   2. Set up GitHub secrets (AZURE_WEBAPP_PUBLISH_PROFILE_STAGING)"
    echo "   3. Deploy application code via GitHub Actions"
else
    echo -e "${GREEN}✅ Infrastructure is ready for deployment!${NC}"
    echo ""
    echo "Next steps:"
    echo "   1. Set up GitHub secrets (AZURE_WEBAPP_PUBLISH_PROFILE_STAGING)"
    echo "   2. Push to main branch to trigger deployment"
    echo "   3. Test in staging: https://your-app-staging.azurewebsites.net"
    echo "   4. Swap to production when ready"
fi
echo ""
echo "For detailed instructions, see DEPLOYMENT.md"
