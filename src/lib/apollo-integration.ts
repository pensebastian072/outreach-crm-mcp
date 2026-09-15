import axios, { AxiosInstance, AxiosError } from "axios";

interface ApolloMessage {
  email: string;
  subject: string;
  body: string;
  previewText: string;
  firstName: string;
  lastName?: string;
  companyName: string;
  customFields?: Record<string, string>;
}

interface ApolloSendResult {
  success: boolean;
  messageId?: string;
  scheduledFor?: string;
  error?: string;
  raw?: any;
}

interface ApolloCampaignStats {
  sent: number;
  opened: number;
  clicked: number;
  replied: number;
  bounced: number;
  unsubscribed: number;
}

interface ApolloReply {
  email: string;
  subject: string;
  body: string;
  receivedAt: string;
  threadId?: string;
}

/**
 * Apollo.io integration for professional email delivery
 * Handles sending, tracking, and reply management
 * 
 * API Reference: https://apollo.io/api/docs
 * Supports: 85-95% inbox rate, optimal send-time scheduling, multi-account sending
 */
export class ApolloClient {
  private apiKey: string;
  private baseUrl = "https://api.apollo.io/v1";
  private client: AxiosInstance;

  constructor(apiKey?: string) {
    this.apiKey = apiKey || process.env.APOLLO_API_KEY || "";
    if (!this.apiKey) {
      console.warn(
        "Apollo API key not found. Set APOLLO_API_KEY environment variable."
      );
    }

    this.client = axios.create({
      baseURL: this.baseUrl,
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": this.apiKey,
      },
      timeout: 30000,
    });
  }

  /**
   * Send an email through Apollo
   * Apollo handles optimal send-time selection and inbox placement
   * 
   * @param message Email message to send
   * @param scheduleOptimalTime If true, Apollo picks optimal send time (Wed 10-12 or 1-3 PM ET)
   * @returns Send result with messageId if successful
   */
  async sendEmail(
    message: ApolloMessage,
    scheduleOptimalTime: boolean = true
  ): Promise<ApolloSendResult> {
    try {
      const payload = {
        from_email: message.email.split("@")[1] === "yourdomain.com" 
          ? message.email 
          : `sender@yourdomain.com`,
        to_email: message.email,
        subject: message.subject,
        body: message.body,
        preview_text: message.previewText,
        contact_name: `${message.firstName} ${message.lastName || ""}`.trim(),
        company_name: message.companyName,
        schedule_optimal_time: scheduleOptimalTime,
        custom_fields: message.customFields || {},
      };

      const response = await this.client.post("/outbound_messages/create", payload);

      if (response.status === 201 || response.status === 200) {
        return {
          success: true,
          messageId: response.data.id,
          scheduledFor: response.data.scheduled_at || undefined,
          raw: response.data,
        };
      } else {
        return {
          success: false,
          error: `Unexpected status: ${response.status}`,
          raw: response.data,
        };
      }
    } catch (error) {
      const axiosError = error as AxiosError;
      return {
        success: false,
        error: axiosError.message,
        raw: axiosError.response?.data,
      };
    }
  }

  /**
   * Get campaign statistics (sends, opens, clicks, replies, bounces)
   * 
   * @param campaignId Apollo campaign ID
   * @returns Stats object with engagement metrics
   */
  async getCampaignStats(campaignId: string): Promise<ApolloCampaignStats> {
    try {
      const response = await this.client.get(`/campaigns/${campaignId}/stats`);

      return {
        sent: response.data.sent || 0,
        opened: response.data.opened || 0,
        clicked: response.data.clicked || 0,
        replied: response.data.replied || 0,
        bounced: response.data.bounced || 0,
        unsubscribed: response.data.unsubscribed || 0,
      };
    } catch (error) {
      console.error("Failed to fetch campaign stats:", error);
      return {
        sent: 0,
        opened: 0,
        clicked: 0,
        replied: 0,
        bounced: 0,
        unsubscribed: 0,
      };
    }
  }

  /**
   * Fetch replies from Apollo-delivered emails
   * Used for reply classification and auto-response workflow
   * 
   * @param campaignId Apollo campaign ID
   * @returns Array of reply objects
   */
  async fetchReplies(campaignId: string): Promise<ApolloReply[]> {
    try {
      const response = await this.client.get(
        `/campaigns/${campaignId}/replies`,
        {
          params: {
            limit: 100,
            sort: "recent",
          },
        }
      );

      return (response.data.replies || []).map((reply: any) => ({
        email: reply.from_email,
        subject: reply.subject,
        body: reply.body,
        receivedAt: reply.received_at,
        threadId: reply.thread_id,
      }));
    } catch (error) {
      console.error("Failed to fetch replies:", error);
      return [];
    }
  }

  /**
   * Check if an Apollo account is ready for sending
   * @returns true if account has valid API key and is responsive
   */
  async isReady(): Promise<boolean> {
    try {
      const response = await this.client.get("/account/status");
      return response.status === 200;
    } catch (error) {
      console.error("Apollo health check failed:", error);
      return false;
    }
  }

  /**
   * Get recommended sending schedule based on warm-up status
   * Returns optimal times for sending to maximize inbox placement
   * 
   * @returns Recommended schedule with timing windows
   */
  getOptimalSendSchedule(): {
    daysOfWeek: string[];
    hoursOfDay: number[];
    timezone: string;
  } {
    return {
      daysOfWeek: ["Wednesday"], // B2B emails perform best Wed
      hoursOfDay: [10, 11, 12, 13, 14, 15], // 10am-3pm ET
      timezone: "America/New_York",
    };
  }
}

export default ApolloClient;
