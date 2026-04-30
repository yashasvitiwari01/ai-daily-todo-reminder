import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error("Missing Supabase configuration");
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const now = new Date();
    const today = now.toISOString().split("T")[0];
    const hour = now.getUTCHours();

    let response: { success: boolean; message: string; action?: string } = {
      success: true,
      message: "Scheduler running",
    };

    if (hour === 9) {
      response.action = "morning_check";
      response.message = "Morning task check triggered";

      const { data: tasks, error } = await supabase
        .from("tasks")
        .select("id, title, completed")
        .eq("task_date", today)
        .eq("completed", false);

      if (!error && tasks && tasks.length > 0) {
        response.message = `Morning check: ${tasks.length} task(s) to complete today`;
      }
    } else if (hour === 17) {
      response.action = "evening_check";
      response.message = "Evening task check triggered";

      const { data: todayTasks, error: todayError } = await supabase
        .from("tasks")
        .select("*")
        .eq("task_date", today)
        .eq("completed", false);

      if (!todayError && todayTasks && todayTasks.length > 0) {
        response.message = `Evening check: ${todayTasks.length} task(s) still pending for today`;
      }

      const tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);
      const tomorrowDate = tomorrow.toISOString().split("T")[0];

      const { data: tomorrowTasks, error: tomorrowError } = await supabase
        .from("tasks")
        .select("*")
        .eq("task_date", tomorrowDate);

      if (tomorrowError) {
        console.error("Error checking tomorrow tasks:", tomorrowError);
      }
    }

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
      },
    });
  } catch (error) {
    console.error("Error in scheduler:", error);
    return new Response(
      JSON.stringify({
        success: false,
        message: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  }
});
