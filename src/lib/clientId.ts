const STORAGE_KEY = 'daily_tasks_client_id';

export function getClientId(): string {
  if (typeof window === 'undefined') return 'legacy';
  let id = window.localStorage.getItem(STORAGE_KEY);
  if (!id) {
    id = crypto.randomUUID();
    window.localStorage.setItem(STORAGE_KEY, id);
  }
  return id;
}
