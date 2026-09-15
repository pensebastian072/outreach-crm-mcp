import { PublicClientApplication, DeviceCodeRequest } from '@azure/msal-node';
import { Client } from '@microsoft/microsoft-graph-client';
import 'isomorphic-fetch';

export class AuthManager {
    private msalClient: PublicClientApplication;
    private graphClient: Client | null = null;

    constructor(tenantId: string, clientId: string) {
        this.msalClient = new PublicClientApplication({
            auth: {
                clientId,
                authority: `https://login.microsoftonline.com/${tenantId}`,
            },
        });
    }

    async authenticate(): Promise<Client> {
        if (this.graphClient) return this.graphClient;

        const deviceCodeRequest: DeviceCodeRequest = {
            scopes: ['https://graph.microsoft.com/Mail.ReadWrite', 'https://graph.microsoft.com/Mail.Send'],
            deviceCodeCallback: (response) => {
                console.log(response.message);
            },
        };

        try {
            const response = await this.msalClient.acquireTokenByDeviceCode(deviceCodeRequest);
            if (!response) throw new Error('Authentication failed: no response');
            this.graphClient = Client.init({
                authProvider: (done) => {
                    done(null, response.accessToken);
                },
            });
            return this.graphClient;
        } catch (error) {
            throw new Error(`Authentication failed: ${error}`);
        }
    }

    getGraphClient(): Client | null {
        return this.graphClient;
    }
}