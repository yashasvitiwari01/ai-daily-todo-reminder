import { supabase } from './supabase';
import { getClientId } from './clientId';

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null;
  const base = import.meta.env.BASE_URL || '/';
  return navigator.serviceWorker.register(`${base}sw.js`);
}

export interface ReminderSettingsPayload {
  timezone: string;
  morning_hour: number;
  evening_hour: number;
}

/**
 * Subscribe to Web Push, persist subscription + reminder defaults for this device.
 * Requires Notification permission and VITE_VAPID_PUBLIC_KEY.
 */
export async function subscribeToPushAndSave(
  settings: ReminderSettingsPayload,
): Promise<{ ok: boolean; message: string }> {
  const vapidPublic = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined;
  if (!vapidPublic) {
    return { ok: false, message: 'VITE_VAPID_PUBLIC_KEY is not configured.' };
  }

  if (!('PushManager' in window)) {
    return { ok: false, message: 'Push messaging is not supported in this browser.' };
  }

  const reg = await registerServiceWorker();
  if (!reg) {
    return { ok: false, message: 'Service workers are not supported.' };
  }

  const previousPush = await reg.pushManager.getSubscription();
  if (previousPush) {
    await previousPush.unsubscribe();
  }

  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(vapidPublic),
  });

  const json = sub.toJSON();
  const endpoint = json.endpoint ?? '';
  const key = json.keys?.p256dh ?? '';
  const auth = json.keys?.auth ?? '';
  if (!endpoint || !key || !auth) {
    return { ok: false, message: 'Could not read push subscription keys.' };
  }

  const clientId = getClientId();

  const { error: subErr } = await supabase.from('push_subscriptions').upsert(
    {
      client_id: clientId,
      endpoint,
      p256dh: key,
      auth,
    },
    { onConflict: 'endpoint' },
  );

  if (subErr) {
    return { ok: false, message: subErr.message };
  }

  const { data: priorState } = await supabase
    .from('reminder_state')
    .select('*')
    .eq('client_id', clientId)
    .maybeSingle();

  const prior = priorState as {
    last_morning_notif_date?: string | null;
    last_evening_notif_date?: string | null;
    last_evening_review_date?: string | null;
    pending_rollover_notice?: string | null;
    midnight_job_done_for_date?: string | null;
  } | null;

  const { error: stateErr } = await supabase.from('reminder_state').upsert(
    {
      client_id: clientId,
      timezone: settings.timezone,
      morning_hour: settings.morning_hour,
      evening_hour: settings.evening_hour,
      last_morning_notif_date: prior?.last_morning_notif_date ?? null,
      last_evening_notif_date: prior?.last_evening_notif_date ?? null,
      last_evening_review_date: prior?.last_evening_review_date ?? null,
      pending_rollover_notice: prior?.pending_rollover_notice ?? null,
      midnight_job_done_for_date: prior?.midnight_job_done_for_date ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'client_id' },
  );

  if (stateErr) {
    return { ok: false, message: stateErr.message };
  }

  return { ok: true, message: 'Notifications enabled for this device.' };
}

export async function saveReminderSettings(settings: ReminderSettingsPayload): Promise<{ ok: boolean; message: string }> {
  const clientId = getClientId();
  const payload = {
    timezone: settings.timezone,
    morning_hour: settings.morning_hour,
    evening_hour: settings.evening_hour,
    updated_at: new Date().toISOString(),
  };

  const { data: updated, error: updErr } = await supabase
    .from('reminder_state')
    .update(payload)
    .eq('client_id', clientId)
    .select('client_id');

  if (updErr) return { ok: false, message: updErr.message };
  if (updated && updated.length > 0) return { ok: true, message: 'Settings saved.' };

  const { error: insErr } = await supabase.from('reminder_state').insert({
    client_id: clientId,
    ...payload,
  });
  if (insErr) return { ok: false, message: insErr.message };
  return { ok: true, message: 'Settings saved.' };
}
