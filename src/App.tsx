import { useCallback, useEffect, useState } from 'react';
import {
  Calendar,
  CheckCircle,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Bell,
  AlertCircle,
  Moon,
  Globe,
} from 'lucide-react';
import { supabase, Task } from './lib/supabase';
import TaskItem from './components/TaskItem';
import AddTaskForm from './components/AddTaskForm';
import {
  requestNotificationPermission,
  scheduleMorningVisibilityPing,
} from './services/scheduler';
import { getClientId } from './lib/clientId';
import {
  COMMON_TIMEZONES,
  getCalendarDateInTimeZone,
  getLocalCalendarDate,
} from './lib/dates';
import {
  registerServiceWorker,
  saveReminderSettings,
  subscribeToPushAndSave,
} from './lib/push';

function formatHourLabel(h: number): string {
  return `${String(h).padStart(2, '0')}:00`;
}

function App() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(() => getLocalCalendarDate());
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [pushMessage, setPushMessage] = useState<string | null>(null);

  const [timezone, setTimezone] = useState(() =>
    typeof Intl !== 'undefined'
      ? Intl.DateTimeFormat().resolvedOptions().timeZone ?? 'UTC'
      : 'UTC',
  );
  const [morningHour, setMorningHour] = useState(8);
  const [eveningHour, setEveningHour] = useState(17);

  /** Saved reminder prefs loaded from DB (or after first successful save / push subscribe). */
  const [schedulePrefsHydrated, setSchedulePrefsHydrated] = useState(false);
  const [hasCommittedSchedule, setHasCommittedSchedule] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState(false);
  const [committedTimezone, setCommittedTimezone] = useState('UTC');
  const [committedMorningHour, setCommittedMorningHour] = useState(8);
  const [committedEveningHour, setCommittedEveningHour] = useState(17);

  const clientId = getClientId();

  const loadTasks = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('tasks')
        .select('*')
        .eq('client_id', clientId)
        .eq('task_date', selectedDate)
        .order('created_at', { ascending: true });

      if (error) throw error;
      setTasks(data || []);
    } catch (error) {
      console.error('Error loading tasks:', error);
    } finally {
      setLoading(false);
    }
  }, [clientId, selectedDate]);

  useEffect(() => {
    requestNotificationPermission();
    void registerServiceWorker();

    void supabase
      .from('reminder_state')
      .select('*')
      .eq('client_id', clientId)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          const tz = data.timezone ?? 'UTC';
          const mh = data.morning_hour ?? 8;
          const eh = data.evening_hour ?? 17;
          setTimezone(tz);
          setMorningHour(mh);
          setEveningHour(eh);
          setCommittedTimezone(tz);
          setCommittedMorningHour(mh);
          setCommittedEveningHour(eh);
          setHasCommittedSchedule(true);
          setEditingSchedule(false);
        } else {
          setHasCommittedSchedule(false);
          setEditingSchedule(true);
        }
        setSchedulePrefsHydrated(true);
      });

    void supabase
      .from('push_subscriptions')
      .select('id', { count: 'exact', head: true })
      .eq('client_id', clientId)
      .then(({ count }) => {
        if (count && count > 0) setNotificationsEnabled(true);
      });

    const stopMorningPing = scheduleMorningVisibilityPing();
    return () => stopMorningPing();
  }, [clientId]);

  useEffect(() => {
    void loadTasks();
  }, [loadTasks]);

  const addTask = async (title: string) => {
    try {
      const { data, error } = await supabase
        .from('tasks')
        .insert([{ title, task_date: selectedDate, client_id: clientId }])
        .select()
        .single();

      if (error) throw error;
      if (data) {
        setTasks([...tasks, data]);
      }
    } catch (error) {
      console.error('Error adding task:', error);
    }
  };

  const toggleComplete = async (taskId: string, completed: boolean) => {
    try {
      const { error } = await supabase
        .from('tasks')
        .update({
          completed,
          completed_at: completed ? new Date().toISOString() : null,
        })
        .eq('id', taskId)
        .eq('client_id', clientId);

      if (error) throw error;

      setTasks(
        tasks.map((task) =>
          task.id === taskId
            ? {
                ...task,
                completed,
                completed_at: completed ? new Date().toISOString() : null,
              }
            : task,
        ),
      );
    } catch (error) {
      console.error('Error updating task:', error);
    }
  };

  const deleteTask = async (taskId: string) => {
    setDeletingId(taskId);
    try {
      const { error } = await supabase
        .from('tasks')
        .delete()
        .eq('id', taskId)
        .eq('client_id', clientId);

      if (error) throw error;

      setTasks(tasks.filter((task) => task.id !== taskId));
    } catch (error) {
      console.error('Error deleting task:', error);
      setDeletingId(null);
    }
  };

  const editTask = async (taskId: string, newTitle: string) => {
    try {
      const { error } = await supabase
        .from('tasks')
        .update({ title: newTitle })
        .eq('id', taskId)
        .eq('client_id', clientId);

      if (error) throw error;

      setTasks(
        tasks.map((task) =>
          task.id === taskId ? { ...task, title: newTitle } : task,
        ),
      );
    } catch (error) {
      console.error('Error editing task:', error);
    }
  };

  const rolloverPendingTasks = async () => {
    try {
      const [ys, ms, ds] = selectedDate.split('-').map(Number);
      const yesterdayDate = getLocalCalendarDate(new Date(ys, ms - 1, ds - 1));

      const { data: pendingTasks, error: fetchError } = await supabase
        .from('tasks')
        .select('*')
        .eq('client_id', clientId)
        .eq('task_date', yesterdayDate)
        .eq('completed', false);

      if (fetchError) throw fetchError;

      if (pendingTasks && pendingTasks.length > 0) {
        const newTasks = pendingTasks.map((task) => ({
          title: task.title,
          task_date: selectedDate,
          completed: false,
          client_id: clientId,
        }));

        const { data, error: insertError } = await supabase
          .from('tasks')
          .insert(newTasks)
          .select();

        if (insertError) throw insertError;

        if (data) {
          setTasks([...tasks, ...data]);
        }
      }
    } catch (error) {
      console.error('Error rolling over tasks:', error);
    }
  };

  const changeDate = (days: number) => {
    const [y, m, d] = selectedDate.split('-').map(Number);
    const nd = new Date(y, m - 1, d + days);
    setSelectedDate(getLocalCalendarDate(nd));
  };

  const goToToday = () => {
    setSelectedDate(getLocalCalendarDate());
  };

  const saveSettings = async () => {
    const r = await saveReminderSettings({
      timezone,
      morning_hour: morningHour,
      evening_hour: eveningHour,
    });
    setPushMessage(r.message);
    if (r.ok) {
      setCommittedTimezone(timezone);
      setCommittedMorningHour(morningHour);
      setCommittedEveningHour(eveningHour);
      setHasCommittedSchedule(true);
      setEditingSchedule(false);
    }
  };

  const enableNotifications = async () => {
    const perm = await requestNotificationPermission();
    if (perm !== 'granted') {
      setPushMessage('Notification permission was not granted.');
      return;
    }
    const r = await subscribeToPushAndSave({
      timezone,
      morning_hour: morningHour,
      evening_hour: eveningHour,
    });
    setPushMessage(r.message);
    if (r.ok) {
      setNotificationsEnabled(true);
      setCommittedTimezone(timezone);
      setCommittedMorningHour(morningHour);
      setCommittedEveningHour(eveningHour);
      setHasCommittedSchedule(true);
      setEditingSchedule(false);
    }
  };

  const cancelScheduleEdit = () => {
    setTimezone(committedTimezone);
    setMorningHour(committedMorningHour);
    setEveningHour(committedEveningHour);
    setEditingSchedule(false);
  };

  const recordEveningReview = async () => {
    const todayTz = getCalendarDateInTimeZone(timezone);
    const { error } = await supabase.from('reminder_state').upsert(
      {
        client_id: clientId,
        timezone,
        morning_hour: morningHour,
        evening_hour: eveningHour,
        last_evening_review_date: todayTz,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'client_id' },
    );
    if (!error) {
      setCommittedTimezone(timezone);
      setCommittedMorningHour(morningHour);
      setCommittedEveningHour(eveningHour);
      setHasCommittedSchedule(true);
      setEditingSchedule(false);
    }
    setPushMessage(
      error
        ? error.message
        : 'Evening review recorded. Pending tasks will not be auto-rolled overnight.',
    );
  };

  const completedCount = tasks.filter((t) => t.completed).length;
  const totalCount = tasks.length;

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-slate-100 flex items-center justify-center">
        <div className="text-lg text-gray-600">Loading your tasks...</div>
      </div>
    );
  }

  const isToday = selectedDate === getLocalCalendarDate();
  const hasVapid = Boolean(import.meta.env.VITE_VAPID_PUBLIC_KEY);

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-slate-100 py-8 px-4">
      <div className="max-w-3xl mx-auto">
        <div className="bg-white rounded-2xl shadow-xl p-8">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="text-3xl font-bold text-gray-800 flex items-center gap-3">
                <Calendar className="w-8 h-8 text-blue-500" />
                Daily Tasks
              </h1>
              <p className="text-gray-500 mt-2">
                {new Date(selectedDate + 'T12:00:00').toLocaleDateString('en-US', {
                  weekday: 'long',
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                })}
              </p>
            </div>
            <div className="text-right">
              <div className="flex items-center gap-2 text-2xl font-bold text-gray-800">
                <CheckCircle className="w-6 h-6 text-green-500" />
                {completedCount}/{totalCount}
              </div>
              <p className="text-sm text-gray-500 mt-1">Tasks completed</p>
            </div>
          </div>

          {pushMessage && (
            <div className="mb-4 p-3 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-700">
              {pushMessage}
            </div>
          )}

          <div className="mb-6 p-4 bg-slate-50 rounded-lg space-y-3">
            {!schedulePrefsHydrated ? (
              <p className="text-sm text-gray-600">Loading your preferences…</p>
            ) : hasCommittedSchedule && !editingSchedule ? (
              <>
                <p className="text-sm font-medium text-gray-700">Your reminder schedule</p>
                <p className="text-sm text-gray-600 leading-relaxed">
                  <span className="font-medium text-gray-800">Timezone:</span> {committedTimezone}
                  <span className="mx-2 text-gray-300">·</span>
                  <span className="font-medium text-gray-800">Morning hour:</span>{' '}
                  {formatHourLabel(committedMorningHour)}
                  <span className="mx-2 text-gray-300">·</span>
                  <span className="font-medium text-gray-800">Evening hour:</span>{' '}
                  {formatHourLabel(committedEveningHour)}
                </p>
                <button
                  type="button"
                  onClick={() => setEditingSchedule(true)}
                  className="text-sm px-3 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 inline-flex items-center gap-2"
                >
                  <Globe className="w-4 h-4 text-gray-500" aria-hidden />
                  Change timezone preference
                </button>
              </>
            ) : (
              <>
                <p className="text-sm font-medium text-gray-700">
                  {hasCommittedSchedule
                    ? 'Update your reminder schedule'
                    : 'Set your timezone once'}
                </p>
                {!hasCommittedSchedule && (
                  <p className="text-xs text-gray-600">
                    Choose your timezone and when you want morning and evening reminders. You can change
                    this later using &quot;Change timezone preference&quot;.
                  </p>
                )}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <label className="block text-xs text-gray-600">
                    Your timezone
                    <select
                      value={timezone}
                      onChange={(e) => setTimezone(e.target.value)}
                      className="mt-1 w-full border border-gray-300 rounded-lg px-2 py-2 text-sm"
                    >
                      {!(COMMON_TIMEZONES as readonly string[]).includes(timezone) && (
                        <option value={timezone}>{timezone} (detected)</option>
                      )}
                      {COMMON_TIMEZONES.map((z) => (
                        <option key={z} value={z}>
                          {z}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block text-xs text-gray-600">
                    Preferred morning hour (0–23)
                    <input
                      type="number"
                      min={0}
                      max={23}
                      value={morningHour}
                      onChange={(e) => setMorningHour(Number(e.target.value))}
                      className="mt-1 w-full border border-gray-300 rounded-lg px-2 py-2 text-sm"
                    />
                  </label>
                  <label className="block text-xs text-gray-600">
                    Preferred evening hour (0–23)
                    <input
                      type="number"
                      min={0}
                      max={23}
                      value={eveningHour}
                      onChange={(e) => setEveningHour(Number(e.target.value))}
                      className="mt-1 w-full border border-gray-300 rounded-lg px-2 py-2 text-sm"
                    />
                  </label>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => void saveSettings()}
                    className="text-sm px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                  >
                    Save schedule
                  </button>
                  {hasCommittedSchedule && (
                    <button
                      type="button"
                      onClick={cancelScheduleEdit}
                      className="text-sm px-3 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
                    >
                      Cancel
                    </button>
                  )}
                </div>
              </>
            )}
          </div>

          <div className="flex items-center justify-between mb-8 p-4 bg-slate-50 rounded-lg flex-wrap gap-2">
            <button
              onClick={() => changeDate(-1)}
              className="p-2 hover:bg-slate-200 rounded-lg transition-colors"
              aria-label="Previous day"
            >
              <ChevronLeft className="w-5 h-5 text-gray-600" />
            </button>
            <button
              onClick={goToToday}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                isToday
                  ? 'bg-blue-500 text-white'
                  : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-100'
              }`}
            >
              Today
            </button>
            <button
              onClick={() => changeDate(1)}
              className="p-2 hover:bg-slate-200 rounded-lg transition-colors"
              aria-label="Next day"
            >
              <ChevronRight className="w-5 h-5 text-gray-600" />
            </button>
            <div className="flex-1 min-w-[1rem]" />
            {typeof window !== 'undefined' && 'Notification' in window && (
              <button
                type="button"
                onClick={() => void enableNotifications()}
                disabled={!hasVapid}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 ${
                  notificationsEnabled ||
                  (typeof Notification !== 'undefined' && Notification.permission === 'granted')
                    ? 'bg-green-100 text-green-700'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200 disabled:opacity-50'
                }`}
              >
                <Bell className="w-4 h-4" />
                {notificationsEnabled ||
                (typeof Notification !== 'undefined' && Notification.permission === 'granted')
                  ? 'Push enabled'
                  : 'Enable push reminders'}
              </button>
            )}
          </div>

          <AddTaskForm onAddTask={addTask} />

          <div className="mt-4 flex flex-col sm:flex-row gap-2">
            <button
              type="button"
              onClick={() => rolloverPendingTasks()}
              className="flex-1 px-4 py-2 bg-amber-50 text-amber-700 rounded-lg hover:bg-amber-100 transition-colors flex items-center justify-center gap-2 text-sm font-medium border border-amber-200"
            >
              <ArrowRight className="w-4 h-4" />
              Roll over pending tasks
            </button>
            <button
              type="button"
              onClick={() => void recordEveningReview()}
              className="flex-1 px-4 py-2 bg-indigo-50 text-indigo-800 rounded-lg hover:bg-indigo-100 transition-colors flex items-center justify-center gap-2 text-sm font-medium border border-indigo-200"
            >
              <Moon className="w-4 h-4" />
              I reviewed today (skip auto overnight rollover)
            </button>
          </div>

          <div className="mt-8 space-y-3">
            {tasks.length === 0 ? (
              <div className="text-center py-12 text-gray-400">
                <p className="text-lg">No tasks for this day yet.</p>
                <p className="text-sm mt-2">Add your first task to get started!</p>
              </div>
            ) : (
              tasks.map((task) => (
                <div key={task.id}>
                  {deletingId === task.id && (
                    <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-2 flex items-start gap-3">
                      <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                      <div className="flex-1">
                        <p className="text-red-700 font-medium text-sm">Deleting task...</p>
                      </div>
                    </div>
                  )}
                  <TaskItem
                    task={task}
                    onToggleComplete={toggleComplete}
                    onDelete={deleteTask}
                    onEdit={editTask}
                  />
                </div>
              ))
            )}
          </div>

          {totalCount > 0 && completedCount === totalCount && (
            <div className="mt-8 p-4 bg-green-50 border border-green-200 rounded-lg text-center">
              <p className="text-green-700 font-medium">
                All tasks completed! Great job!
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;
