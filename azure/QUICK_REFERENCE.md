# Azure Deployment Slots - Quick Reference

Quick command reference for managing Azure App Service deployment slots.

## Configuration

```bash
# Set these variables for your environment
RESOURCE_GROUP="your-resource-group"
WEB_APP_NAME="your-app-name"
SUBSCRIPTION_ID="your-subscription-id"  # Replace with your actual subscription ID
```

## Common Commands

### Deployment Slot Management

```bash
# List all deployment slots
az webapp deployment slot list \
  --resource-group $RESOURCE_GROUP \
  --name $WEB_APP_NAME \
  --output table

# Show specific slot details
az webapp deployment slot show \
  --resource-group $RESOURCE_GROUP \
  --name $WEB_APP_NAME \
  --slot staging

# Create a new slot (not recommended, use Bicep instead)
az webapp deployment slot create \
  --resource-group $RESOURCE_GROUP \
  --name $WEB_APP_NAME \
  --slot new-slot

# Delete a slot (use with caution)
az webapp deployment slot delete \
  --resource-group $RESOURCE_GROUP \
  --name $WEB_APP_NAME \
  --slot slot-to-delete
```

### Slot Swaps

```bash
# Swap staging to production
az webapp deployment slot swap \
  --resource-group $RESOURCE_GROUP \
  --name $WEB_APP_NAME \
  --slot staging \
  --target-slot production

# Preview a swap (without completing it)
az webapp deployment slot swap \
  --resource-group $RESOURCE_GROUP \
  --name $WEB_APP_NAME \
  --slot staging \
  --target-slot production \
  --preview

# Complete a previewed swap
az webapp deployment slot swap \
  --resource-group $RESOURCE_GROUP \
  --name $WEB_APP_NAME \
  --slot staging \
  --target-slot production \
  --action complete

# Reset/cancel a previewed swap
az webapp deployment slot swap \
  --resource-group $RESOURCE_GROUP \
  --name $WEB_APP_NAME \
  --slot staging \
  --action reset
```

### Configuration Management

```bash
# List all app settings for a slot
az webapp config appsettings list \
  --resource-group $RESOURCE_GROUP \
  --name $WEB_APP_NAME \
  --slot staging

# Set app settings for a slot
az webapp config appsettings set \
  --resource-group $RESOURCE_GROUP \
  --name $WEB_APP_NAME \
  --slot staging \
  --settings NODE_ENV=staging PORT=8080

# Delete an app setting
az webapp config appsettings delete \
  --resource-group $RESOURCE_GROUP \
  --name $WEB_APP_NAME \
  --slot staging \
  --setting-names NODE_ENV

# Mark settings as "slot settings" (don't swap)
az webapp config appsettings set \
  --resource-group $RESOURCE_GROUP \
  --name $WEB_APP_NAME \
  --slot staging \
  --slot-settings NODE_ENV=staging
```

### Logs and Monitoring

```bash
# Stream logs from a slot
az webapp log tail \
  --resource-group $RESOURCE_GROUP \
  --name $WEB_APP_NAME \
  --slot staging

# Download logs
az webapp log download \
  --resource-group $RESOURCE_GROUP \
  --name $WEB_APP_NAME \
  --slot staging

# View deployment logs
az webapp log deployment list \
  --resource-group $RESOURCE_GROUP \
  --name $WEB_APP_NAME \
  --slot staging
```

### Deployment Operations

```bash
# Get publish profile
az webapp deployment list-publishing-profiles \
  --resource-group $RESOURCE_GROUP \
  --name $WEB_APP_NAME \
  --slot staging \
  --xml

# List recent deployments
az webapp deployment list \
  --resource-group $RESOURCE_GROUP \
  --name $WEB_APP_NAME \
  --slot staging

# Show deployment details
az webapp deployment show \
  --resource-group $RESOURCE_GROUP \
  --name $WEB_APP_NAME \
  --slot staging \
  --deployment-id <deployment-id>
```

### Slot URLs

Access your deployment slots:

```bash
# Production (no slot name)
https://your-app-name.azurewebsites.net

# Staging slot
https://your-app-staging.azurewebsites.net

# Development slot (ecb0fqahaebtd6g9)
https://your-app-slotname.azurewebsites.net
```

### Health Checks

```bash
# Check if slot is running
az webapp show \
  --resource-group $RESOURCE_GROUP \
  --name $WEB_APP_NAME \
  --slot staging \
  --query state -o tsv

# Restart a slot
az webapp restart \
  --resource-group $RESOURCE_GROUP \
  --name $WEB_APP_NAME \
  --slot staging

# Stop a slot
az webapp stop \
  --resource-group $RESOURCE_GROUP \
  --name $WEB_APP_NAME \
  --slot staging

# Start a slot
az webapp start \
  --resource-group $RESOURCE_GROUP \
  --name $WEB_APP_NAME \
  --slot staging
```

## Infrastructure Deployment

```bash
# Deploy infrastructure with Bicep
cd azure
./deploy.sh  # or .\deploy.ps1 on Windows

# Validate configuration
./validate.sh  # or .\validate.ps1 on Windows

# Manual Bicep deployment
az deployment group create \
  --resource-group $RESOURCE_GROUP \
  --template-file main.bicep \
  --parameters main.parameters.json
```

## Troubleshooting

```bash
# Check if resource exists
az webapp show \
  --resource-group $RESOURCE_GROUP \
  --name $WEB_APP_NAME

# Check if slot exists
az webapp deployment slot show \
  --resource-group $RESOURCE_GROUP \
  --name $WEB_APP_NAME \
  --slot staging

# View recent activity
az monitor activity-log list \
  --resource-group $RESOURCE_GROUP \
  --max-events 20

# Check deployment history
az deployment group list \
  --resource-group $RESOURCE_GROUP \
  --query "[0:5].{Name:name, State:properties.provisioningState, Timestamp:properties.timestamp}" \
  --output table
```

## Best Practices

### Development Workflow

1. **Develop** → Make changes in feature branch
2. **Build** → GitHub Actions builds the code
3. **Deploy to Staging** → Automated deployment to staging slot
4. **Test** → Manual testing in staging environment
5. **Swap** → Swap staging to production
6. **Monitor** → Watch for errors in production
7. **Rollback** → Swap back if issues occur

### Slot Settings Best Practices

- Use **slot settings** for environment-specific values (NODE_ENV, database connections)
- Use **regular settings** for values that should swap (feature flags, API keys)
- Always test in staging before swapping to production
- Keep staging configuration as close to production as possible

### Security

```bash
# Enable HTTPS only
az webapp update \
  --resource-group $RESOURCE_GROUP \
  --name $WEB_APP_NAME \
  --https-only true

# Set minimum TLS version
az webapp config set \
  --resource-group $RESOURCE_GROUP \
  --name $WEB_APP_NAME \
  --min-tls-version 1.2

# Add deployment lock to prevent deletion
az lock create \
  --name prevent-deletion \
  --resource-group $RESOURCE_GROUP \
  --resource $WEB_APP_NAME \
  --resource-type Microsoft.Web/sites \
  --lock-type CanNotDelete
```

## Quick Links

- [Azure Portal](https://portal.azure.com)
- [App Services](https://portal.azure.com/#view/HubsExtension/BrowseResource/resourceType/Microsoft.Web%2Fsites)
- [Deployment Slots Documentation](https://docs.microsoft.com/en-us/azure/app-service/deploy-staging-slots)
- [Azure CLI Reference](https://docs.microsoft.com/en-us/cli/azure/webapp/deployment/slot)

## Resource IDs

Replace `{subscription-id}` with your actual subscription ID:

```bash
# Web App Resource ID
/subscriptions/{subscription-id}/resourceGroups/your-resource-group/providers/Microsoft.Web/sites/your-app-name

# Staging Slot Resource ID
/subscriptions/{subscription-id}/resourceGroups/your-resource-group/providers/Microsoft.Web/sites/your-app-name/slots/staging

# Development Slot Resource ID
/subscriptions/{subscription-id}/resourceGroups/your-resource-group/providers/Microsoft.Web/sites/your-app-name/slots/ecb0fqahaebtd6g9
```
