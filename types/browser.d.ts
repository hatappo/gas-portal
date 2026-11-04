interface CatalogTool {
  id: string;
  name: string;
  url: string;
  description: string;
  category: string;
  tags: string[];
  relatedLinks?: { label: string; url: string }[];
  scope: 'internal' | 'external';
}
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
interface GasRunner {
  withSuccessHandler<T>(callback: (response: T) => void): GasRunner;
  withFailureHandler(callback: () => void): GasRunner;
  getCatalog(forceRefresh?: boolean): void;
  saveCatalogCacheTtl(seconds: number): void;
  saveLanguage(language: string): void;
  saveTheme(theme: string): void;
  savePortalSettings(settings: PortalSettings, browserLanguage?: string): void;
  resetPortalSettings(): void;
}
declare const google: { script: { run: GasRunner } };
