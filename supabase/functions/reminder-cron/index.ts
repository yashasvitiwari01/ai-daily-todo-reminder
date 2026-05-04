import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import webpush from "npm:web-push@3.6.7";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey, X-Cron-Secret",
};

interface PushSubscriptionRow {
  id: string;
  client_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

interface ReminderStateRow {
  client_id: string;
  timezone: string;
  morning_hour: number;
  evening_hour: number;
  last_morning_notif_date: string | null;
  last_evening_notif_date: string | null;
  last_evening_review_date: string | null;
  pending_rollover_notice: string | null;
  midnight_job_done_for_date: string | null;
  updated_at?: string;
}

function getPartsInTimeZone(date: Date, timeZone: string) {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = dtf.formatToParts(date);
  const map: Record<string, string> = {};
  for (const p of parts) {
    if (p.type !== "literal") map[p.type] = p.value;
  }
  const dateStr = `${map.year}-${map.month}-${map.day}`;
  const hour = Number.parseInt(map.hour ?? "0", 10);
  const minute = Number.parseInt(map.minute ?? "0", 10);
  return { dateStr, hour, minute };
}

function addCalendarDays(dateStr: string, delta: number): string {
  const [y, mo, day] = dateStr.split("-").map(Number);
  const nd = new Date(Date.UTC(y, mo - 1, day + delta));
  return nd.toISOString().slice(0, 10);
}

function defaultState(clientId: string): ReminderStateRow {
  return {
    client_id: clientId,
    timezone: "UTC",
    morning_hour: 8,
    evening_hour: 17,
    last_morning_notif_date: null,
    last_evening_notif_date: null,
    last_evening_review_date: null,
    pending_rollover_notice: null,
    midnight_job_done_for_date: null,
  };
}

async function sendToSubscription(
  row: PushSubscriptionRow,
  payload: { title: string; body: string },
  supabase: ReturnType<typeof createClient>,
) {
  const subject = Deno.env.get("WEB_PUSH_CONTACT") ?? "mailto:support@example.com";
  const publicKey = Deno.env.get("VAPID_PUBLIC_KEY");
  const privateKey = Deno.env.get("VAPID_PRIVATE_KEY");
  if (!publicKey || !privateKey) {
    throw new Error("Missing VAPID_PUBLIC_KEY or VAPID_PRIVATE_KEY");
  }
  webpush.setVapidDetails(subject, publicKey, privateKey);

  try {
    await webpush.sendNotification(
      {
        endpoint: row.endpoint,
        keys: { p256dh: row.p256dh, auth: row.auth },
      },
      JSON.stringify(payload),
      { TTL: 86_400 },
    );
  } catch (e: unknown) {
    const status = (e as { statusCode?: number }).statusCode;
    if (status === 404 || status === 410) {
      await supabase.from("push_subscriptions").delete().eq("id", row.id);
    } else {
      console.error("webpush error", e);
    }
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  const cronSecret = Deno.env.get("CRON_SECRET");
  if (cronSecret) {
    const sent = req.headers.get("X-Cron-Secret");
    if (sent !== cronSecret) {
      return new Response(JSON.stringify({ success: false, message: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !supabaseServiceKey) {
    return new Response(
      JSON.stringify({ success: false, message: "Missing Supabase configuration" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  const now = new Date();

  const { data: subs, error: subsError } = await supabase
    .from("push_subscriptions")
    .select("*");

  if (subsError) {
    console.error(subsError);
    return new Response(JSON.stringify({ success: false, message: subsError.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const rows = (subs ?? []) as PushSubscriptionRow[];
  if (rows.length === 0) {
    return new Response(JSON.stringify({ success: true, message: "No subscriptions", processed: 0 }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const clientIds = [...new Set(rows.map((r) => r.client_id))];
  const { data: states } = await supabase
    .from("reminder_state")
    .select("*")
    .in("client_id", clientIds);

  const stateMap = new Map<string, ReminderStateRow>(
    (states as ReminderStateRow[] | null)?.map((s) => [s.client_id, s]) ?? [],
  );

  const processed: string[] = [];

  for (const clientId of clientIds) {
    const base = stateMap.get(clientId) ?? defaultState(clientId);
    const tz = base.timezone || "UTC";
    let state = { ...base };

    const { dateStr: todayStr, hour, minute } = getPartsInTimeZone(now, tz);
    const yesterdayStr = addCalendarDays(todayStr, -1);
    const tomorrowStr = addCalendarDays(todayStr, 1);

    const subsForClient = rows.filter((r) => r.client_id === clientId);

    // Morning: send once on/after configured hour until noon (handles laptop wake/open later in morning).
    const inMorningSlot = hour >= state.morning_hour && hour < 12;
    // Evening: send once on/after configured hour through end of day.
    const inEveningSlot = hour >= state.evening_hour;
    const inMidnightSlot =
      hour === 0 && minute < 25;

    if (inMidnightSlot) {
      if (state.midnight_job_done_for_date === yesterdayStr) {
        // already handled this transition
      } else if (state.last_evening_review_date === yesterdayStr) {
        state = {
          ...state,
          midnight_job_done_for_date: yesterdayStr,
          updated_at: new Date().toISOString(),
        };
        await supabase.from("reminder_state").upsert(state, { onConflict: "client_id" });
        processed.push(`${clientId}:midnight_skip_reviewed`);
      } else {
        const { data: pending, error: pendErr } = await supabase
          .from("tasks")
          .select("id, title")
          .eq("client_id", clientId)
          .eq("task_date", yesterdayStr)
          .eq("completed", false);

        if (!pendErr && pending && pending.length > 0) {
          const inserts = pending.map((t: { title: string }) => ({
            client_id: clientId,
            title: t.title,
            task_date: todayStr,
            completed: false,
          }));
          const { error: insErr } = await supabase.from("tasks").insert(inserts);
          if (insErr) {
            console.error(insErr);
          } else {
            const notice =
              `Yesterday we automatically rolled ${pending.length} incomplete task(s) to today. Open the app to mark any complete, or confirm you are fine carrying them forward.`;
            state = {
              ...state,
              pending_rollover_notice: notice,
              midnight_job_done_for_date: yesterdayStr,
              updated_at: new Date().toISOString(),
            };
            await supabase.from("reminder_state").upsert(state, { onConflict: "client_id" });
            processed.push(`${clientId}:midnight_rollover_${pending.length}`);
          }
        } else {
          state = {
            ...state,
            midnight_job_done_for_date: yesterdayStr,
            updated_at: new Date().toISOString(),
          };
          await supabase.from("reminder_state").upsert(state, { onConflict: "client_id" });
          processed.push(`${clientId}:midnight_no_pending`);
        }
      }
    }

    const refreshed = await supabase
      .from("reminder_state")
      .select("*")
      .eq("client_id", clientId)
      .maybeSingle();
    const current = (refreshed.data as ReminderStateRow | null) ?? state;

    if (inMorningSlot && current.last_morning_notif_date !== todayStr) {
      const { count } = await supabase
        .from("tasks")
        .select("*", { count: "exact", head: true })
        .eq("client_id", clientId)
        .eq("task_date", todayStr)
        .eq("completed", false);

      const open =
        typeof count === "number"
          ? count === 0
            ? "You have no open tasks for today."
            : `You have ${count} open task(s) for today.`
          : "Review your tasks for today.";

      const extra = current.pending_rollover_notice
        ? `${current.pending_rollover_notice}`
        : "";

      const body = extra ? `${extra}\n\n${open}` : `${open} Open the app to plan your day.`;

      for (const sub of subsForClient) {
        await sendToSubscription(
          sub,
          {
            title: "Today's tasks",
            body,
          },
          supabase,
        );
      }

      await supabase
        .from("reminder_state")
        .upsert(
          {
            ...current,
            last_morning_notif_date: todayStr,
            pending_rollover_notice: null,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "client_id" },
        );

      processed.push(`${clientId}:morning`);
    }

    if (inEveningSlot && current.last_evening_notif_date !== todayStr) {
      const { count } = await supabase
        .from("tasks")
        .select("*", { count: "exact", head: true })
        .eq("client_id", clientId)
        .eq("task_date", todayStr)
        .eq("completed", false);

      const pendingMsg =
        typeof count === "number" && count > 0
          ? `${count} task(s) still open for today.`
          : "Review today's progress.";

      const body =
        `${pendingMsg} Mark done what you finished, or roll pending tasks to ${tomorrowStr}. If you skip reviewing, remaining tasks will roll over overnight automatically.`;

      for (const sub of subsForClient) {
        await sendToSubscription(
          sub,
          {
            title: "Evening review (5:00 PM)",
            body,
          },
          supabase,
        );
      }

      await supabase
        .from("reminder_state")
        .upsert(
          {
            ...current,
            last_evening_notif_date: todayStr,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "client_id" },
        );

      processed.push(`${clientId}:evening`);
    }
  }

  return new Response(
    JSON.stringify({
      success: true,
      message: "Reminder cron completed",
      processed,
      at: now.toISOString(),
    }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
