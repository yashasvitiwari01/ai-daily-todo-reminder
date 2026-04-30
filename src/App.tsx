import { useEffect, useState } from 'react';
import { Calendar, CheckCircle, ArrowRight, ChevronLeft, ChevronRight, Bell, AlertCircle } from 'lucide-react';
import { supabase, Task } from './lib/supabase';
import TaskItem from './components/TaskItem';
import AddTaskForm from './components/AddTaskForm';
import { scheduler } from './services/scheduler';

function App() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    scheduler.requestPermission();
    loadTasks();
    scheduler.start(() => loadTasks());

    return () => {
      scheduler.clear();
    };
  }, []);

  useEffect(() => {
    loadTasks();
  }, [selectedDate]);

  const loadTasks = async () => {
    try {
      const { data, error } = await supabase
        .from('tasks')
        .select('*')
        .eq('task_date', selectedDate)
        .order('created_at', { ascending: true });

      if (error) throw error;
      setTasks(data || []);
    } catch (error) {
      console.error('Error loading tasks:', error);
    } finally {
      setLoading(false);
    }
  };

  const addTask = async (title: string) => {
    try {
      const { data, error } = await supabase
        .from('tasks')
        .insert([{ title, task_date: selectedDate }])
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
        .eq('id', taskId);

      if (error) throw error;

      setTasks(
        tasks.map((task) =>
          task.id === taskId
            ? {
                ...task,
                completed,
                completed_at: completed ? new Date().toISOString() : null,
              }
            : task
        )
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
        .eq('id', taskId);

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
        .eq('id', taskId);

      if (error) throw error;

      setTasks(
        tasks.map((task) =>
          task.id === taskId
            ? { ...task, title: newTitle }
            : task
        )
      );
    } catch (error) {
      console.error('Error editing task:', error);
    }
  };

  const rolloverPendingTasks = async () => {
    try {
      const yesterday = new Date(selectedDate);
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayDate = yesterday.toISOString().split('T')[0];

      const { data: pendingTasks, error: fetchError } = await supabase
        .from('tasks')
        .select('*')
        .eq('task_date', yesterdayDate)
        .eq('completed', false);

      if (fetchError) throw fetchError;

      if (pendingTasks && pendingTasks.length > 0) {
        const newTasks = pendingTasks.map((task) => ({
          title: task.title,
          task_date: selectedDate,
          completed: false,
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
    const newDate = new Date(selectedDate);
    newDate.setDate(newDate.getDate() + days);
    setSelectedDate(newDate.toISOString().split('T')[0]);
  };

  const goToToday = () => {
    setSelectedDate(new Date().toISOString().split('T')[0]);
  };

  const enableNotifications = () => {
    scheduler.requestPermission();
    setNotificationsEnabled(true);
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

  const isToday = selectedDate === new Date().toISOString().split('T')[0];

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
                {new Date(selectedDate).toLocaleDateString('en-US', {
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

          <div className="flex items-center justify-between mb-8 p-4 bg-slate-50 rounded-lg">
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
            <div className="flex-1" />
            {typeof window !== 'undefined' && 'Notification' in window && (
              <button
                onClick={enableNotifications}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 ${
                  notificationsEnabled || (typeof Notification !== 'undefined' && Notification.permission === 'granted')
                    ? 'bg-green-100 text-green-700'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                <Bell className="w-4 h-4" />
                {notificationsEnabled || (typeof Notification !== 'undefined' && Notification.permission === 'granted')
                  ? 'Notifications On'
                  : 'Enable Notifications'}
              </button>
            )}
          </div>

          <AddTaskForm onAddTask={addTask} />

          <button
            onClick={rolloverPendingTasks}
            className="mt-4 w-full px-4 py-2 bg-amber-50 text-amber-700 rounded-lg hover:bg-amber-100 transition-colors flex items-center justify-center gap-2 text-sm font-medium border border-amber-200"
          >
            <ArrowRight className="w-4 h-4" />
            Roll over pending tasks
          </button>

          <div className="mt-8 space-y-3">
            {tasks.length === 0 ? (
              <div className="text-center py-12 text-gray-400">
                <p className="text-lg">No tasks for today yet.</p>
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
