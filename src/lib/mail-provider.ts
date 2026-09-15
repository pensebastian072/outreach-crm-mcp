export interface SendResult {
    messageId?: string;
    threadId?: string;
}

export interface DraftResult {
    draftId: string;
    messageId?: string;
    threadId?: string;
}

export interface SyncResult {
    processed: number;
    historyId?: string;
}

export interface WatchResult {
    historyId?: string;
    expiration?: number;
}

export interface MailProvider {
    sendEmail(to: string, subject: string, body: string, contactName?: string): Promise<SendResult>;
    createDraft(to: string, subject: string, body: string, contactName?: string): Promise<DraftResult>;
    sendDraft(draftId: string): Promise<void>;
    getMessage(messageId: string): Promise<any>;
    watchMailbox(callbackUrl?: string): Promise<WatchResult>;
    syncReplies(historyId?: string): Promise<SyncResult>;
}
