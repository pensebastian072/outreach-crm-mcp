# Azure Deployment Slot Troubleshooting Guide

This guide provides troubleshooting steps for resolving Azure App Service deployment slot 404 errors and related issues.

## Table of Contents
- [Common Issues](#common-issues)
- [Deployment Slot 404 Error](#deployment-slot-404-error)
- [Validation Commands](#validation-commands)
- [Resolution Steps](#resolution-steps)
- [Prevention](#prevention)

## Common Issues

### 1. Deployment Slot 404 Error

**Symptom**: 
```
Error: The Resource 'Microsoft.Web/sites/your-app-name/slots/ecb0fqahaebtd6g9' under resource group 'your-resource-group' was not found.
Status Code: 404
```

**Root Causes**:
- Deployment slot was never created
- Deployment slot was deleted manually
- Incorrect slot name in configuration
- Infrastructure was not deployed properly

### 2. Slot Not Found During Deployment

**Symptom**: GitHub Actions workflow fails with "slot not found" error

**Root Causes**:
- Infrastructure not deployed
- Missing deployment slot configuration
- Incorrect publish profile

### 3. Application Not Accessible After Slot Swap

**Symptom**: Application returns errors after swapping slots

**Root Causes**:
- Environment variables not configured
- Slot-specific settings not preserved
- Application configuration mismatch

## Deployment Slot 404 Error

### Quick Diagnosis

Run these commands to diagnose the issue:

```bash
# 1. Login to Azure
az login

# 2. Set the correct subscription
az account set --subscription "your-subscription-id"

# 3. Check if the web app exists
az webapp show \
  --resource-group your-resource-group \
  --name your-app-name

# 4. List all deployment slots
az webapp deployment slot list \
  --resource-group your-resource-group \
  --name your-app-name \
  --output table
```

### Expected Output

You should see three slots:
- `staging`
- `ecb0fqahaebtd6g9` (development)
- Production (not listed, it's the default)

If slots are missing, proceed to [Resolution Steps](#resolution-steps).

## Validation Commands

### Check Web App Existence

```bash
# Check if web app exists
az webapp show \
  --resource-group your-resource-group \
  --name your-app-name \
  --query "{name:name, state:state, location:location}" \
  --output table
```

### List All Deployment Slots

```bash
# List all slots with their URLs
az webapp deployment slot list \
  --resource-group your-resource-group \
  --name your-app-name \
  --query "[].{Name:name, State:state, URL:defaultHostName}" \
  --output table
```

### Check Specific Slot

```bash
# Check if specific slot exists
az webapp deployment slot show \
  --resource-group your-resource-group \
  --name your-app-name \
  --slot ecb0fqahaebtd6g9 \
  --query "{name:name, state:state, url:defaultHostName}" \
  --output table
```

### Verify Slot Configuration

```bash
# Get slot configuration
az webapp config show \
  --resource-group your-resource-group \
  --name your-app-name \
  --slot ecb0fqahaebtd6g9 \
  --output table
```

## Resolution Steps

### Step 1: Deploy Infrastructure

If deployment slots don't exist, deploy the infrastructure:

```bash
# Navigate to the azure directory
cd azure

# Run deployment script (Linux/macOS)
./deploy.sh

# OR for Windows PowerShell
.\deploy.ps1
```

**Manual Deployment Alternative**:

```bash
# Deploy using Azure CLI
az deployment group create \
  --resource-group your-resource-group \
  --template-file azure/main.bicep \
  --parameters azure/main.parameters.json
```

### Step 2: Verify Deployment

After deployment, verify all slots exist:

```bash
# Check deployment outputs
az deployment group show \
  --resource-group your-resource-group \
  --name main \
  --query properties.outputs

# List slots again
az webapp deployment slot list \
  --resource-group your-resource-group \
  --name your-app-name \
  --output table
```

### Step 3: Configure Slot Settings

Set environment variables for each slot:

```bash
# Configure staging slot
az webapp config appsettings set \
  --resource-group your-resource-group \
  --name your-app-name \
  --slot staging \
  --settings \
    PORT=8080 \
    NODE_ENV=staging \
    DATABASE_PATH=./data/outreach.db

# Configure development slot
az webapp config appsettings set \
  --resource-group your-resource-group \
  --name your-app-name \
  --slot ecb0fqahaebtd6g9 \
  --settings \
    PORT=8080 \
    NODE_ENV=development \
    DATABASE_PATH=./data/outreach.db
```

### Step 4: Update GitHub Secrets

Download and configure publish profiles:

1. **Download Staging Publish Profile**:
   - Go to [Azure Portal](https://portal.azure.com)
   - Navigate to: App Service > your-app-name > Deployment slots > staging
   - Click "Get publish profile" (in Overview section)
   - Download the `.PublishSettings` file

2. **Add to GitHub Secrets**:
   - Go to your GitHub repository
   - Navigate to: Settings > Secrets and variables > Actions
   - Click "New repository secret"
   - Name: `AZURE_WEBAPP_PUBLISH_PROFILE_STAGING`
   - Value: Paste entire contents of publish profile file
   - Click "Add secret"

3. **Optional: Create Service Principal** (for slot validation):
   ```bash
   # Create service principal
   az ad sp create-for-rbac \
     --name "your-app-github" \
     --role contributor \
     --scopes /subscriptions/{subscription-id}/resourceGroups/your-resource-group \
     --sdk-auth
   
   # Copy the JSON output and add as AZURE_CREDENTIALS secret in GitHub
   ```

### Step 5: Test Deployment

Trigger a deployment to verify everything works:

```bash
# Manually trigger GitHub Actions workflow
# Go to: GitHub > Repository > Actions > Azure Web Apps Deploy > Run workflow
```

Or push a commit to the main branch.

## Prevention

### 1. Use Infrastructure as Code

Always define your infrastructure in code (Bicep/ARM/Terraform):
- ✅ Version controlled
- ✅ Reproducible
- ✅ Documented
- ✅ Auditable

### 2. Validate Before Deployment

Add validation steps to your CI/CD pipeline:

```yaml
# Example GitHub Actions step
- name: Validate deployment slots
  run: |
    slots=$(az webapp deployment slot list \
      --resource-group your-resource-group \
      --name your-app-name \
      --query "[].name" -o tsv)
    
    if ! echo "$slots" | grep -q "staging"; then
      echo "ERROR: Staging slot not found"
      exit 1
    fi
```

### 3. Monitor Slot Status

Set up Azure Monitor alerts for:
- Deployment slot health
- HTTP 404 errors
- Configuration changes
- Resource deletions

### 4. Use Deployment Locks

Prevent accidental deletion:

```bash
# Add delete lock to web app
az lock create \
  --name "your-app-lock" \
  --lock-type CanNotDelete \
  --resource-group your-resource-group \
  --resource-name your-app-name \
  --resource-type Microsoft.Web/sites
```

### 5. Document Slot Configuration

Keep documentation updated:
- Slot names and purposes
- Environment variables per slot
- Deployment workflow
- Swap procedures

## Common Error Messages

### "Resource not found" (404)

```
The Resource 'Microsoft.Web/sites/your-app-name/slots/ecb0fqahaebtd6g9' 
under resource group 'your-resource-group' was not found.
```

**Resolution**: Deploy infrastructure using `azure/deploy.sh`

### "Slot name not found"

```
Deployment slot 'staging' not found for app 'your-app-name'
```

**Resolution**: Check slot name spelling and deploy infrastructure

### "Conflict with existing resource"

```
A WebApp with the name 'your-app-name' already exists
```

**Resolution**: Use existing web app or choose different name

### "Insufficient permissions"

```
The client '...' does not have authorization to perform action 
'Microsoft.Web/sites/write'
```

**Resolution**: Grant Contributor role to your service principal

## Additional Resources

### Azure CLI Commands Reference

```bash
# List all web apps in resource group
az webapp list --resource-group your-resource-group --output table

# Get web app details
az webapp show --resource-group your-resource-group --name your-app-name

# List deployment slots
az webapp deployment slot list --resource-group your-resource-group --name your-app-name

# Create a slot manually (not recommended, use Bicep instead)
az webapp deployment slot create \
  --resource-group your-resource-group \
  --name your-app-name \
  --slot staging

# Delete a slot (use with caution)
az webapp deployment slot delete \
  --resource-group your-resource-group \
  --name your-app-name \
  --slot staging

# Swap slots
az webapp deployment slot swap \
  --resource-group your-resource-group \
  --name your-app-name \
  --slot staging \
  --target-slot production

# Get slot configuration
az webapp config show \
  --resource-group your-resource-group \
  --name your-app-name \
  --slot staging
```

### Azure Portal Navigation

1. **View Deployment Slots**:
   - Azure Portal > App Service > your-app-name
   - Left menu: Deployment > Deployment slots

2. **View Slot Settings**:
   - Azure Portal > App Service > your-app-name > Deployment slots
   - Click on a slot name
   - Left menu: Settings > Configuration

3. **Download Publish Profile**:
   - Azure Portal > App Service > your-app-name > Deployment slots
   - Click on a slot name
   - Overview > Get publish profile

### Support Links

- [Azure App Service Deployment Slots Documentation](https://docs.microsoft.com/en-us/azure/app-service/deploy-staging-slots)
- [Azure Bicep Documentation](https://docs.microsoft.com/en-us/azure/azure-resource-manager/bicep/)
- [GitHub Actions for Azure](https://github.com/Azure/actions)
- [Azure CLI Reference](https://docs.microsoft.com/en-us/cli/azure/)

## Still Having Issues?

If you continue to experience problems:

1. **Check Azure Service Health**: Verify Azure services are operational
2. **Review Azure Activity Log**: Check for any failed operations
3. **Enable Diagnostic Logging**: Turn on detailed logging in Azure Portal
4. **Contact Support**: Open a support ticket in Azure Portal

For application-specific issues, see the main [DEPLOYMENT.md](../DEPLOYMENT.md) guide.
