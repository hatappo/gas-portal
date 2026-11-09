interface GmailSettings { enabled: boolean; limit: number }
interface GmailItem { id: string; threadId: string; title: string; sender: string; receivedAt: string }
interface GmailResult { items: GmailItem[]; account: string; partial: boolean; error: string; hasMore: boolean }
type GmailSettingsResponse = { ok: true; settings: GmailSettings } | { ok: false; error: string };
type GmailActionsResponse = ({ ok: true; fetchedAt: number; cached: boolean } & GmailResult) | { ok: false; error: string };
declare var PortalGmail: {
  limits: number[];
  defaults(): GmailSettings;
  validSettings(value: unknown): value is GmailSettings;
  restore(value: unknown): GmailSettings;
  validEmail(value: unknown): value is string;
  validId(value: unknown): value is string;
  url(email: string, threadId: string): string;
};
