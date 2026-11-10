/** Stable filter values stay independent of translated labels and connection names. */
export const actionTypes = [
  { id: 'issue', service: 'github', serviceLabel: 'GitHub', label: 'Assigned issue', reasons: ['Assigned issue'] },
  { id: 'review', service: 'github', serviceLabel: 'GitHub', label: 'Direct review', reasons: ['Direct review'] },
  { id: 'team-review', service: 'github', serviceLabel: 'GitHub', label: 'Team review', reasons: ['Team review'] },
  { id: 'changes', service: 'github', serviceLabel: 'GitHub', label: 'Changes requested', reasons: ['Changes requested'] },
  { id: 'todo', service: 'slack', serviceLabel: 'Slack', label: 'To-do', reasons: ['To-do', 'To-do (status unknown)'] },
  { id: 'mail', service: 'gmail', serviceLabel: 'Gmail', label: 'Unread mail', reasons: ['Unread mail'] },
];
export interface ActionFilters { text: string; types: string[] }
export const normalizeSearch = (text: string) => text.normalize('NFKC').toLocaleLowerCase('ja').trim();

/** Only the trailing is: token is being edited; the preceding text remains a search. */
export function typeSuggestion(text: string) {
  const match = /(^|\s)is:([^\s]*)$/i.exec(text);
  return match ? { prefix: text.slice(0, match.index).trimEnd(), term: normalizeSearch(match[2]) } : null;
}
export function hasActionFilters(filters: ActionFilters) {
  return !!filters.types.length || !!normalizeSearch(typeSuggestion(filters.text)?.prefix ?? filters.text);
}
export function matchesAction(item: ActionItem, filters: ActionFilters, fallbackTitle: string) {
  const text = normalizeSearch(typeSuggestion(filters.text)?.prefix ?? filters.text);
  const matchesType = !filters.types.length || actionTypes.some(type =>
    filters.types.includes(type.id) && type.service === item.service &&
    type.reasons.some(reason => item.reasons.includes(reason)));
  return matchesType && normalizeSearch([item.title || fallbackTitle, item.context].join(' ')).includes(text);
}
