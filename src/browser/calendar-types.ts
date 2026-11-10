export interface CalendarViewState {
  settings: CalendarSettings;
  initialized: boolean;
  busy: boolean;
  saving: boolean;
  error: string;
  settingsError: string;
  choicesError: string;
  saved: boolean;
  snapshot?: CalendarSnapshot;
  calendarNames: Record<string, string>;
  calendars: CalendarChoice[];
  choicesBusy: boolean;
  open: boolean;
  now: number;
  language: string;
}
export interface CalendarCommands {
  toggle(open: boolean): void;
  refresh(): void;
  loadChoices(): void;
  save(settings: CalendarSettings): void;
}
export function calendarErrorText(code: string, language: string) {
  const key =
    code === 'AUTHORIZATION_REQUIRED'
      ? 'Calendar authorization is required. Run authorizePortal in the GAS editor and grant access.'
      : code === 'FORBIDDEN'
        ? 'Calendar access was denied. Check calendar permissions and enable the Calendar API in your Cloud project if needed.'
        : code === 'INVALID_INPUT'
          ? 'Select between one and five calendars.'
          : code === 'RATE_LIMITED'
            ? 'Calendar rate limit reached. Try again later.'
            : 'Could not load the calendar. Try again.';
  return PortalI18n.t(key, language);
}
