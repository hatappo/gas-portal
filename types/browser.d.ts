interface CatalogTool {
  id: string;
  name: string;
  url: string;
  description: string;
  tags: string[];
  children?: CatalogChild[];
  icon?: string;
}
interface CatalogChild { name: string; url: string; description: string; icon?: string }
interface CatalogWarning { row: number; message: string }
type CatalogResponse =
  | { ok: true; tools: CatalogTool[]; issues: CatalogWarning[]; cache?: { hit: boolean; fetchedAt: number } }
  | { ok: false; error?: string };
type ThemeResponse = { ok: true; theme: string } | { ok: false };
interface PortalSettings {
  PORTAL_NAME: string;
  PORTAL_ICON: string;
  PORTAL_HEADLINE: string;
  PORTAL_DESCRIPTION: string;
}
type PortalSettingsResponse = { ok: true; settings: PortalSettings } | { ok: false; error?: string };
interface SpreadsheetSettings { SPREADSHEET_ID: string; SHEET_NAME: string }
type SpreadsheetSettingsResponse = { ok: true; settings: SpreadsheetSettings } | { ok: false; error?: string };
type SpreadsheetCreationResponse =
  | { ok: true; spreadsheetId: string }
  | { ok: false; error: string; spreadsheetId?: string; connected?: boolean; notCreated?: boolean };
interface GitHubConnectionInfo { tokenSuffix?: string; id: string; label: string; login: string; owner: string }
interface GitHubConnectionInput { id: string; token: string; owner: string }
interface GitHubActionItem { id: string; title: string; url: string; repository: string; number: number; updatedAt: string; kind: string; reasons: string[] }
interface GitHubActionGroup { kind: string; items: GitHubActionItem[]; total: number; partial: boolean; error: string; searchUrl: string }
type GitHubActionsResponse = { ok: true; groups: GitHubActionGroup[]; fetchedAt: number; cached: boolean } | { ok: false; error: string };
type GitHubConnectionsResponse = { ok: true; connections: GitHubConnectionInfo[] } | { ok: false; error: string };
type GitHubSaveResponse = { ok: true; connection: GitHubConnectionInfo } | { ok: false; error: string };
interface SlackConnectionInfo { tokenSuffix?: string; id: string; label: string }
interface SlackConnectionInput { id: string; token: string }
interface SlackActionItem { id: string; title: string; url: string; context: string; postedAt: string; todoState?: 'to_do' | 'unknown' }
interface SlackDiagnostics { searchTotal: number | null; received: number; eligible: number; skipped: number; hasMore: boolean | null; remaining: number | null; completed: number; incomplete: number; unknown: number }
type SlackActionsResponse = { ok: true; items: SlackActionItem[]; diagnostics?: SlackDiagnostics; hasMore?: boolean; error: string; partial: boolean; fetchedAt: number; cached: boolean } | { ok: false; error: string };
type SlackBookmarksResponse = { ok: true; workspace: string; url: string; items: SlackActionItem[]; hasMore: boolean; partial: boolean; error: string; fetchedAt: number; cached: boolean } | { ok: false; error: string };
type SlackConnectionsResponse = { ok: true; connections: SlackConnectionInfo[] } | { ok: false; error: string };
type SlackSaveResponse = { ok: true; connection: SlackConnectionInfo } | { ok: false; error: string };
interface GasRunner {
  getGmailSettings(): void;
  saveGmailSettings(settings: GmailSettings): void;
  getGmailActionItems(forceRefresh?: boolean): void;
  getCalendarSettings(): void;
  saveCalendarSettings(settings: CalendarSettings, names?: Record<string, string>): void;
  getCalendarChoices(): void;
  getCalendarEvents(forceRefresh: boolean, timeZone: string): void;
  saveSlackBookmarkLimit(limit: number): void;
  getSlackConnections(): void;
  getSlackBookmarks(id: string, forceRefresh?: boolean): void;
  saveSlackConnection(input: SlackConnectionInput): void;
  disconnectSlack(id: string): void;
  getSlackActionItems(id: string, forceRefresh?: boolean): void;
  getGitHubConnections(): void;
  saveGitHubConnection(input: GitHubConnectionInput): void;
  disconnectGitHub(id: string): void;
  getGitHubActionItems(id: string, forceRefresh?: boolean): void;
  createPortalSpreadsheet(browserLanguage?: string): void;
  saveSpreadsheetSettings(settings: SpreadsheetSettings): void;
  withSuccessHandler<T>(callback: (response: T) => void): GasRunner;
  withFailureHandler(callback: () => void): GasRunner;
  getCatalog(forceRefresh?: boolean): void;
  saveCatalogCacheTtl(seconds: number): void;
  saveActionsCacheTtl(seconds: number): void;
  saveUnblockedUrlSchemes(schemes: string[]): void;
  saveLanguage(language: string): void;
  saveTheme(theme: string): void;
  savePortalSettings(settings: PortalSettings, browserLanguage?: string): void;
}
interface SaveRequest<T> {
  send: (runner: GasRunner) => void;
  confirm: (response: T) => string | false | { error: string };
  failureMessage: string;
  restore?: () => void;
  busyMessage?: string;
  timeoutMessage?: string;
  timeoutMs?: number;
}
interface GasLocation { hash: string }
interface GasHistory {
  push(state: null, params: null, hash: string): void;
  setChangeHandler(callback: (event: { location: GasLocation }) => void): void;
}
declare const google: { script: {
  run: GasRunner;
  history?: GasHistory;
  url?: { getLocation(callback: (location: GasLocation) => void): void };
} };

interface ActionItem {
  service: string; serviceLabel: string; id: string; title: string; titleFallback?: string; url: string;
  context: string; updatedAt: string; dateLabel?: string; reasons: string[];
}
interface ActionNotice { message: string; reason?: string; url?: string }
interface DiagnosticMetric { unit?: 'items'; label: string; value: number | string | null }
interface ActionDiagnostic { id: string; label: string; fetchedAt?: number; cached?: boolean; metrics: DiagnosticMetric[] }
interface ActionResult { diagnostics?: DiagnosticMetric[]; hasMore?: boolean; items: ActionItem[]; notices: ActionNotice[]; fetchedAt?: number; cached?: boolean }
interface InboxGroup { id: string; label: string; items: ActionItem[]; loaded: boolean; failed: boolean; hasMore: boolean }
interface ActionSource { inboxService?: string; id: string; label: string; serviceLabel: string; load(force: boolean, done: (result: ActionResult) => void): void }
