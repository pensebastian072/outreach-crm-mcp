// Azure App Service with Deployment Slots for HQ Outreach MCP
// This template defines the infrastructure for the your-app-name web app with deployment slots

@description('The name of the web app')
param webAppName string = 'your-app-name'

@description('The name of the resource group')
param resourceGroupName string = 'your-resource-group'

@description('The location for all resources')
param location string = resourceGroup().location

@description('The pricing tier for the App Service plan')
@allowed([
  'B1'
  'B2'
  'B3'
  'S1'
  'S2'
  'S3'
  'P1v2'
  'P2v2'
  'P3v2'
])
param appServicePlanSku string = 'B1'

@description('The Node.js version to use')
param nodeVersion string = '20-lts'

// App Service Plan
resource appServicePlan 'Microsoft.Web/serverfarms@2022-09-01' = {
  name: '${webAppName}-plan'
  location: location
  sku: {
    name: appServicePlanSku
  }
  kind: 'linux'
  properties: {
    reserved: true
  }
}

// Web App
resource webApp 'Microsoft.Web/sites@2022-09-01' = {
  name: webAppName
  location: location
  kind: 'app,linux'
  properties: {
    serverFarmId: appServicePlan.id
    httpsOnly: true
    siteConfig: {
      linuxFxVersion: 'NODE|${nodeVersion}'
      alwaysOn: true
      appSettings: [
        {
          name: 'NODE_ENV'
          value: 'production'
        }
        {
          name: 'PORT'
          value: '8080'
        }
        {
          name: 'DATABASE_PATH'
          value: './data/outreach.db'
        }
        {
          name: 'WEBSITE_NODE_DEFAULT_VERSION'
          value: nodeVersion
        }
      ]
      ftpsState: 'Disabled'
      minTlsVersion: '1.2'
    }
  }
}

// Staging Deployment Slot
resource stagingSlot 'Microsoft.Web/sites/slots@2022-09-01' = {
  name: 'staging'
  parent: webApp
  location: location
  kind: 'app,linux'
  properties: {
    serverFarmId: appServicePlan.id
    httpsOnly: true
    siteConfig: {
      linuxFxVersion: 'NODE|${nodeVersion}'
      alwaysOn: true
      appSettings: [
        {
          name: 'NODE_ENV'
          value: 'staging'
        }
        {
          name: 'PORT'
          value: '8080'
        }
        {
          name: 'DATABASE_PATH'
          value: './data/outreach.db'
        }
        {
          name: 'WEBSITE_NODE_DEFAULT_VERSION'
          value: nodeVersion
        }
      ]
      ftpsState: 'Disabled'
      minTlsVersion: '1.2'
    }
  }
}

// Development Deployment Slot (for the slot ID mentioned in the error)
resource devSlot 'Microsoft.Web/sites/slots@2022-09-01' = {
  name: 'ecb0fqahaebtd6g9'
  parent: webApp
  location: location
  kind: 'app,linux'
  properties: {
    serverFarmId: appServicePlan.id
    httpsOnly: true
    siteConfig: {
      linuxFxVersion: 'NODE|${nodeVersion}'
      alwaysOn: true
      appSettings: [
        {
          name: 'NODE_ENV'
          value: 'development'
        }
        {
          name: 'PORT'
          value: '8080'
        }
        {
          name: 'DATABASE_PATH'
          value: './data/outreach.db'
        }
        {
          name: 'WEBSITE_NODE_DEFAULT_VERSION'
          value: nodeVersion
        }
      ]
      ftpsState: 'Disabled'
      minTlsVersion: '1.2'
    }
  }
}

// Outputs
output webAppUrl string = webApp.properties.defaultHostName
output stagingSlotUrl string = stagingSlot.properties.defaultHostName
output devSlotUrl string = devSlot.properties.defaultHostName
output webAppId string = webApp.id
output stagingSlotId string = stagingSlot.id
output devSlotId string = devSlot.id
