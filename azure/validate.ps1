# Validation script to check Azure deployment slot configuration
# Run this after deploying infrastructure to verify everything is set up correctly

$ErrorActionPreference = "Stop"

Write-Host "=== Azure Deployment Slot Validation ===" -ForegroundColor Cyan
Write-Host ""

# Configuration
$RESOURCE_GROUP = "your-resource-group"
$WEB_APP_NAME = "your-app-name"
$EXPECTED_SLOTS = @("staging", "ecb0fqahaebtd6g9")

# Check if Azure CLI is installed
try {
    $azVersion = az --version
    if ($LASTEXITCODE -ne 0) {
        throw "Azure CLI not found"
    }
} catch {
    Write-Host "❌ Azure CLI is not installed" -ForegroundColor Red
    Write-Host "Please install it from: https://docs.microsoft.com/en-us/cli/azure/install-azure-cli" -ForegroundColor Yellow
    exit 1
}

# Check if logged in
Write-Host "Checking Azure login status..." -ForegroundColor Yellow
try {
    $account = az account show | ConvertFrom-Json
    $subscription = $account.name
    Write-Host "✅ Logged in to Azure" -ForegroundColor Green
    Write-Host "   Subscription: $subscription" -ForegroundColor White
} catch {
    Write-Host "❌ Not logged in to Azure" -ForegroundColor Red
    Write-Host "Please run: az login" -ForegroundColor Yellow
    exit 1
}
Write-Host ""

# Check if resource group exists
Write-Host "Validating resource group..." -ForegroundColor Yellow
try {
    az group show --name $RESOURCE_GROUP | Out-Null
    Write-Host "✅ Resource group exists" -ForegroundColor Green
} catch {
    Write-Host "❌ Resource group '$RESOURCE_GROUP' not found" -ForegroundColor Red
    Write-Host "   Run: cd azure; .\deploy.ps1" -ForegroundColor Yellow
    exit 1
}
Write-Host ""

# Check if web app exists
Write-Host "Validating web app..." -ForegroundColor Yellow
try {
    $webApp = az webapp show --resource-group $RESOURCE_GROUP --name $WEB_APP_NAME | ConvertFrom-Json
    Write-Host "✅ Web app exists" -ForegroundColor Green
    Write-Host "   Name: $WEB_APP_NAME" -ForegroundColor White
    Write-Host "   State: $($webApp.state)" -ForegroundColor White
} catch {
    Write-Host "❌ Web app '$WEB_APP_NAME' not found" -ForegroundColor Red
    Write-Host "   Run: cd azure; .\deploy.ps1" -ForegroundColor Yellow
    exit 1
}
Write-Host ""

# Check deployment slots
Write-Host "Validating deployment slots..." -ForegroundColor Yellow
try {
    $slots = az webapp deployment slot list `
        --resource-group $RESOURCE_GROUP `
        --name $WEB_APP_NAME | ConvertFrom-Json
    
    if ($slots.Count -eq 0) {
        Write-Host "❌ No deployment slots found" -ForegroundColor Red
        Write-Host "   Run: cd azure; .\deploy.ps1" -ForegroundColor Yellow
        exit 1
    }

    Write-Host "✅ Deployment slots found:" -ForegroundColor Green
    $allSlotsFound = $true
    foreach ($expectedSlot in $EXPECTED_SLOTS) {
        $found = $slots | Where-Object { $_.name -eq $expectedSlot }
        if ($found) {
            Write-Host "   ✓ $expectedSlot" -ForegroundColor Green
        } else {
            Write-Host "   ✗ $expectedSlot (missing)" -ForegroundColor Red
            $allSlotsFound = $false
        }
    }

    if (-not $allSlotsFound) {
        Write-Host ""
        Write-Host "❌ Some required slots are missing" -ForegroundColor Red
        Write-Host "   Run: cd azure; .\deploy.ps1" -ForegroundColor Yellow
        exit 1
    }
} catch {
    Write-Host "❌ Error checking deployment slots" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Yellow
    exit 1
}
Write-Host ""

# Check slot URLs
Write-Host "Deployment slot URLs:" -ForegroundColor Cyan
foreach ($slot in $slots) {
    $slotUrl = $slot.defaultHostName
    Write-Host "   $($slot.name): https://$slotUrl" -ForegroundColor White
}

$prodUrl = $webApp.defaultHostName
Write-Host "   production: https://$prodUrl" -ForegroundColor White
Write-Host ""

# Check environment variables for staging slot
Write-Host "Checking staging slot configuration..." -ForegroundColor Yellow
$configuredSettings = $null
try {
    $stagingConfig = az webapp config appsettings list `
        --resource-group $RESOURCE_GROUP `
        --name $WEB_APP_NAME `
        --slot staging 2>&1 | ConvertFrom-Json
    
    if ($stagingConfig -is [array]) {
        $requiredSettings = @("NODE_ENV", "PORT", "DATABASE_PATH")
        $configuredSettings = $stagingConfig | Where-Object { $requiredSettings -contains $_.name }
        
        if ($configuredSettings.Count -gt 0) {
            Write-Host "✅ Staging slot has environment variables:" -ForegroundColor Green
            foreach ($setting in $configuredSettings) {
                Write-Host "   $($setting.name) = $($setting.value)" -ForegroundColor White
            }
        } else {
            Write-Host "⚠️  Staging slot environment variables not configured" -ForegroundColor Yellow
            Write-Host "   Configure in Azure Portal or see DEPLOYMENT.md" -ForegroundColor Yellow
        }
    } else {
        throw "Unexpected response format"
    }
} catch {
    Write-Host "⚠️  Could not check staging slot configuration" -ForegroundColor Yellow
    Write-Host "   Error: $($_.Exception.Message)" -ForegroundColor Yellow
    Write-Host "   Configure in Azure Portal or see DEPLOYMENT.md" -ForegroundColor Yellow
}
Write-Host ""

# Summary
Write-Host "=== Validation Summary ===" -ForegroundColor Cyan
Write-Host "✅ Resource group: $RESOURCE_GROUP" -ForegroundColor Green
Write-Host "✅ Web app: $WEB_APP_NAME ($($webApp.state))" -ForegroundColor Green
Write-Host "✅ Deployment slots: $($EXPECTED_SLOTS.Count) configured" -ForegroundColor Green
Write-Host ""

if (-not $configuredSettings -or $configuredSettings.Count -eq 0) {
    Write-Host "⚠️  Next steps:" -ForegroundColor Yellow
    Write-Host "   1. Configure environment variables in Azure Portal" -ForegroundColor White
    Write-Host "   2. Set up GitHub secrets (AZURE_WEBAPP_PUBLISH_PROFILE_STAGING)" -ForegroundColor White
    Write-Host "   3. Deploy application code via GitHub Actions" -ForegroundColor White
} else {
    Write-Host "✅ Infrastructure is ready for deployment!" -ForegroundColor Green
    Write-Host ""
    Write-Host "Next steps:" -ForegroundColor Cyan
    Write-Host "   1. Set up GitHub secrets (AZURE_WEBAPP_PUBLISH_PROFILE_STAGING)" -ForegroundColor White
    Write-Host "   2. Push to main branch to trigger deployment" -ForegroundColor White
    Write-Host "   3. Test in staging: https://your-app-staging.azurewebsites.net" -ForegroundColor White
    Write-Host "   4. Swap to production when ready" -ForegroundColor White
}
Write-Host ""
Write-Host "For detailed instructions, see DEPLOYMENT.md" -ForegroundColor Yellow
