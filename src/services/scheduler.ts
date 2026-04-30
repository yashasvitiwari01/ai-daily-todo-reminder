export interface ScheduleCallback {
  (): Promise<void> | void;
}

class Scheduler {
  private timers: Map<string, NodeJS.Timeout> = new Map();
  private lastCheckedDay: string = '';

  start(callback: ScheduleCallback) {
    this.scheduleCheck(callback);
    setInterval(() => this.scheduleCheck(callback), 60000);
  }

  private scheduleCheck(callback: ScheduleCallback) {
    const now = new Date();
    const currentDay = now.toISOString().split('T')[0];
    const hour = now.getHours();
    const minutes = now.getMinutes();

    const shouldRunAt9am = hour === 9 && minutes === 0 && currentDay !== this.lastCheckedDay;
    const shouldRunAt5pm = hour === 17 && minutes === 0 && currentDay !== this.lastCheckedDay;

    if (shouldRunAt9am || shouldRunAt5pm) {
      this.lastCheckedDay = currentDay;

      if (shouldRunAt9am) {
        this.showNotification('Good morning! Time to review your tasks for today.');
      } else {
        this.showNotification('Evening check-in: Review pending tasks and plan for tomorrow.');
      }

      callback();
    }
  }

  private showNotification(message: string) {
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification('Task Reminder', {
        body: message,
        icon: '/task-icon.png',
      });
    }
  }

  requestPermission() {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }

  clear() {
    this.timers.forEach((timer) => clearInterval(timer));
    this.timers.clear();
  }
}

export const scheduler = new Scheduler();
