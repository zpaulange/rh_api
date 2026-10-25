import type { Permission, Role, User } from '../types';
import { LIBELLE_PERMISSION, LIBELLE_ROLE_LONG, TOUTES_PERMISSIONS } from '../metier/permissions';
import { mutate } from './noyau';
import { acteurDe, employe, journaliser, notifier } from './commun';

/* ================= Rôles & permissions ================= */

/** Attribution d'un rôle : réservée à l'administrateur, jamais sur son propre compte */
export function changerRole(user: User, employeId: string, role: Role, motif: string): void {
  mutate((db) => {
    if (user.role !== 'admin') throw new Error('Seul un administrateur peut modifier les rôles.');
    const compte = db.comptes.find((c) => c.employeId === employeId);
    if (!compte) throw new Error('Aucun compte associé.');
    if (compte.id === user.compteId) throw new Error('Vous ne pouvez pas modifier votre propre rôle.');
    if (compte.role === role) return;
    if (compte.role === 'admin' && db.comptes.filter((c) => c.role === 'admin' && c.actif).length <= 1)
      throw new Error('Impossible : il doit rester au moins un administrateur actif.');
    if (!motif.trim()) throw new Error('Indiquez le motif du changement de rôle.');
    const ancien = compte.role;
    compte.role = role;
    const emp = employe(db, employeId);
    journaliser(db, acteurDe(user), 'CHANGEMENT_ROLE', compte.email, emp.id, `${LIBELLE_ROLE_LONG[ancien]} → ${LIBELLE_ROLE_LONG[role]} • ${motif.trim()}`);
    notifier(db, {
      pour: { employeId },
      titre: 'Vos droits d’accès ont changé',
      message: `Nouveau rôle : ${LIBELLE_ROLE_LONG[role]}. Reconnectez-vous si l’affichage ne se met pas à jour.`,
      niveau: 'info',
    });
  });
}

/** Matrice des droits du rôle RH (l'admin conserve toujours tous les droits) */
export function modifierPermissions(user: User, role: Role, permissions: Permission[]): void {
  mutate((db) => {
    if (user.role !== 'admin') throw new Error('Seul un administrateur peut modifier les permissions.');
    if (role !== 'rh') throw new Error('Seules les permissions du rôle RH sont paramétrables.');
    const avant = new Set(db.permissions.rh);
    const apres = new Set(permissions.filter((p) => TOUTES_PERMISSIONS.includes(p)));
    const ajoutees = [...apres].filter((p) => !avant.has(p));
    const retirees = [...avant].filter((p) => !apres.has(p));
    if (ajoutees.length + retirees.length === 0) return;
    db.permissions.rh = TOUTES_PERMISSIONS.filter((p) => apres.has(p));
    journaliser(
      db,
      acteurDe(user),
      'MODIFICATION_PERMISSIONS',
      'Rôle RH',
      null,
      [ajoutees.length ? `Accordées : ${ajoutees.map((p) => LIBELLE_PERMISSION[p]).join(', ')}` : '', retirees.length ? `Retirées : ${retirees.map((p) => LIBELLE_PERMISSION[p]).join(', ')}` : '']
        .filter(Boolean)
        .join(' • '),
    );
    notifier(db, { pour: { role: 'rh' }, titre: 'Vos droits de gestion ont été modifiés', message: "L'administrateur a mis à jour les permissions du rôle RH.", niveau: 'info' });
  });
}
