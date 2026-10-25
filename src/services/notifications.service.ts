import type { Database, Notification, User } from '../types';
import { mutate } from './noyau';


/* ================= Notifications ================= */

export const notificationsPour = (db: Database, user: User): Notification[] =>
  db.notifications
    .filter((n) => n.pour.employeId === user.employeId || n.pour.role === user.role)
    .sort((a, b) => b.date.localeCompare(a.date));

export function marquerLues(ids: string[]): void {
  if (ids.length === 0) return;
  mutate((db) => {
    db.notifications.forEach((n) => {
      if (ids.includes(n.id)) n.lu = true;
    });
  });
}
