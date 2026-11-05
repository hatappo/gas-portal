declare var PortalI18n: {
  preference(language: unknown): 'auto' | 'ja' | 'en';
  resolve(preference: unknown, languages?: readonly string[]): 'ja' | 'en';
  normalize(language: unknown): 'ja' | 'en';
  t(key: string, language?: string, values?: Record<string, string | number>): string;
  translate(text: string, language: string): string;
};
declare var PortalUrlSchemes: {
  fixed: readonly string[];
  optional: readonly string[];
  normalizeUnblocked(value: unknown): string[];
  schemeOf(url: string): string;
  isBlocked(url: string, unblocked: readonly string[]): boolean;
};
