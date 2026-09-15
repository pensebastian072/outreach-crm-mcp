import axios, { AxiosInstance, AxiosError } from "axios";

interface InstantlyWarmupStatus {
  email: string;
  accountId: string;
  warmupDay: number;
  status: "warming" | "ready" | "paused" | "failed";
  deliverability: number; // 0-100 percentage
  lastChecked: string;
  nextCheckAt?: string;
}

interface InstantlyAddAccountResult {
  success: boolean;
  accountId?: string;
  warmupStartDate?: string;
  error?: string;
}

interface InstantlyScheduleRecommendation {
  accountsReady: string[];
  accountsWarmingUp: string[];
  daysUntilAllReady: number;
  canStartSending: boolean;
  recommendedLaunchDate: string;
}

/**
 * Instantly.ai integration for automatic email warm-up
 * Builds sender reputation over 7-14 days before production sending
 * 
 * API Reference: https://instantly.ai/api-docs
 * Cost: $97/month (unlimited accounts, unlimited warm-up)
 * Process: Instantly sends automated low-volume emails to warm-up seed contacts,
 *          gradually increasing volume as reputation/deliverability improves
 */
export class InstantlyClient {
  private apiKey: string;
  private baseUrl = "https://api.instantly.ai/v1";
  private client: AxiosInstance;
  private accounts: Map<string, InstantlyWarmupStatus> = new Map();

  constructor(apiKey?: string) {
    this.apiKey = apiKey || process.env.INSTANTLY_API_KEY || "";
    if (!this.apiKey) {
      console.warn(
        "Instantly API key not found. Set INSTANTLY_API_KEY environment variable."
      );
    }

    this.client = axios.create({
      baseURL: this.baseUrl,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      timeout: 30000,
    });
  }

  /**
   * Register an email account for automatic warm-up
   * Instantly will begin sending low-volume warm-up emails to seed contacts
   * 
   * @param email Email address to warm up (e.g., sender@yourdomain.com)
   * @param provider Email provider ('microsoft365', 'gmail', 'custom_smtp')
   * @returns Account creation result with warmup start date
   */
  async addEmailAccount(
    email: string,
    provider: "microsoft365" | "gmail" | "custom_smtp" = "microsoft365"
  ): Promise<InstantlyAddAccountResult> {
    try {
      const payload = {
        email,
        provider,
        warmup_enabled: true,
        warmup_intensity: "standard", // standard = 7-10 days, aggressive = 5-7 days
      };

      const response = await this.client.post("/accounts/add", payload);

      if (response.status === 200 || response.status === 201) {
        const result: InstantlyAddAccountResult = {
          success: true,
          accountId: response.data.account_id,
          warmupStartDate: response.data.warmup_start_date,
        };

        // Cache the account
        this.accounts.set(email, {
          email,
          accountId: response.data.account_id,
          warmupDay: 0,
          status: "warming",
          deliverability: 0,
          lastChecked: new Date().toISOString(),
        });

        return result;
      } else {
        return {
          success: false,
          error: `Unexpected status: ${response.status}`,
        };
      }
    } catch (error) {
      const axiosError = error as AxiosError;
      return {
        success: false,
        error: axiosError.message,
      };
    }
  }

  /**
   * Get warm-up status for a specific email account
   * Returns current day number, deliverability score, and overall status
   * 
   * @param email Email address to check status for
   * @returns Warm-up status including day number and deliverability percentage
   */
  async getWarmupStatus(email: string): Promise<InstantlyWarmupStatus> {
    try {
      const response = await this.client.get("/accounts/warmup-status", {
        params: { email },
      });

      const status: InstantlyWarmupStatus = {
        email,
        accountId: response.data.account_id,
        warmupDay: response.data.warmup_day || 0,
        status: response.data.status || "warming",
        deliverability: response.data.deliverability || 0,
        lastChecked: new Date().toISOString(),
        nextCheckAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      };

      this.accounts.set(email, status);
      return status;
    } catch (error) {
      console.error(`Failed to fetch warm-up status for ${email}:`, error);
      
      // Return cached status if available
      if (this.accounts.has(email)) {
        return this.accounts.get(email)!;
      }

      return {
        email,
        accountId: "unknown",
        warmupDay: 0,
        status: "failed",
        deliverability: 0,
        lastChecked: new Date().toISOString(),
      };
    }
  }

  /**
   * Check if an account is ready for production sending
   * Ready = deliverability > 80% AND warmupDay >= 7
   * 
   * @param email Email address to check
   * @returns true if account is ready for sending
   */
  async isAccountReady(email: string): Promise<boolean> {
    const status = await this.getWarmupStatus(email);
    return status.deliverability > 80 && status.warmupDay >= 7;
  }

  /**
   * Get status of all warming accounts
   * @returns Array of all registered accounts and their warm-up progress
   */
  async getAllAccounts(): Promise<InstantlyWarmupStatus[]> {
    try {
      const response = await this.client.get("/accounts");
      
      const accounts: InstantlyWarmupStatus[] = (response.data.accounts || []).map(
        (account: any) => ({
          email: account.email,
          accountId: account.account_id,
          warmupDay: account.warmup_day || 0,
          status: account.status || "warming",
          deliverability: account.deliverability || 0,
          lastChecked: new Date().toISOString(),
        })
      );

      // Update cache
      accounts.forEach((account) => {
        this.accounts.set(account.email, account);
      });

      return accounts;
    } catch (error) {
      console.error("Failed to fetch accounts:", error);
      return Array.from(this.accounts.values());
    }
  }

  /**
   * Calculate warm-up schedule and recommend launch date
   * Determines when all accounts will be ready for production sending
   * 
   * @returns Recommendation with days until ready and suggested launch date
   */
  async getWarmupScheduleRecommendation(): Promise<InstantlyScheduleRecommendation> {
    const accounts = await this.getAllAccounts();

    if (accounts.length === 0) {
      return {
        accountsReady: [],
        accountsWarmingUp: [],
        daysUntilAllReady: 0,
        canStartSending: false,
        recommendedLaunchDate: new Date().toISOString().split("T")[0],
      };
    }

    const ready = accounts.filter((a) => a.deliverability > 80 && a.warmupDay >= 7);
    const warming = accounts.filter((a) => a.status === "warming");

    // Calculate days until slowest account is ready
    let maxDaysRemaining = 0;
    warming.forEach((account) => {
      const daysRemaining = Math.max(0, 7 - account.warmupDay);
      maxDaysRemaining = Math.max(maxDaysRemaining, daysRemaining);
    });

    const launchDate = new Date();
    launchDate.setDate(launchDate.getDate() + maxDaysRemaining);

    return {
      accountsReady: ready.map((a) => a.email),
      accountsWarmingUp: warming.map((a) => a.email),
      daysUntilAllReady: maxDaysRemaining,
      canStartSending: ready.length === accounts.length && ready.length > 0,
      recommendedLaunchDate: launchDate.toISOString().split("T")[0],
    };
  }

  /**
   * Get recommended daily sending schedule based on warm-up progress
   * Prevents volume spikes that would harm reputation
   * 
   * @param totalContacts Total number of contacts to reach
   * @param totalDays Business days available for campaign
   * @returns Daily sending cap for each day
   */
  async getRecommendedDailySchedule(
    totalContacts: number,
    totalDays: number
  ): Promise<Map<number, number>> {
    const schedule = new Map<number, number>();

    // Standard ramp: start low, increase as accounts warm
    // Day 1-2: 15/day (low volume)
    // Day 3-4: 30/day (ramping up)
    // Day 5-7: 45/day (medium-high)
    // Day 8-10: 60/day (full capacity)

    const dailyCaps = [15, 15, 30, 30, 45, 45, 60, 60, 60, 60];

    let totalSent = 0;
    for (let day = 0; day < Math.min(totalDays, dailyCaps.length); day++) {
      const cap = dailyCaps[day];
      const remaining = Math.min(cap, totalContacts - totalSent);
      schedule.set(day + 1, remaining);
      totalSent += remaining;
    }

    return schedule;
  }
}

export default InstantlyClient;
