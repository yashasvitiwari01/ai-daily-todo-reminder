/**
 * Browser notifications when the tab becomes visible in the morning (optional complement to Web Push).
 * Background reminders require the Supabase `reminder-cron` Edge Function + push subscription.
 */
export function requestNotificationPermission(): Promise<NotificationPermission> {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return Promise.resolve('denied');
  }
  if (Notification.permission === 'default') {
    return Notification.requestPermission();
  }
  return Promise.resolve(Notification.permission);
}

/** Show a one-time local notification after opening the browser before noon (same calendar day, local timezone). */
export function scheduleMorningVisibilityPing(): () => void {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return () => {};
  }

  const now = new Date();
  const todayLocal = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(
    now.getDate(),
  ).padStart(2, '0')}`;
  const storageKey = `morning_visibility_ping_${todayLocal}`;

  const tryPing = () => {
    if (document.visibilityState !== 'visible') return;
    if (Notification.permission !== 'granted') return;
    const hour = new Date().getHours();
    if (hour >= 12) return;
    if (sessionStorage.getItem(storageKey)) return;
    sessionStorage.setItem(storageKey, '1');
    new Notification("Today's tasks", {
      body: 'Open Daily Tasks to see what you planned for today.',
    });
  };

  document.addEventListener('visibilitychange', tryPing);
  tryPing();

  return () => document.removeEventListener('visibilitychange', tryPing);
}
