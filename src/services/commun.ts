import { construireDocument } from '../metier/documents';
import { serverNow, serverNowISO } from '../metier/horloge';
import { dateKey } from '../metier/temps';
import type { ActionAudit, Compte, Database, DocumentGenere, Employe, ModeleDocument, Notification, Permission, Role, User } from '../types';
import { LIBELLE_PERMISSION, roleA } from '../metier/permissions';
import { uid } from './noyau';


/* ================= Outils internes ================= */

/** Refuse l'action si le rôle de l'utilisateur ne dispose pas de la permission (matrice des rôles) */
export function exiger(db: Database, user: Pick<User, 'role'>, permission: Permission): void {
  if (!roleA(db, user.role, permission)) throw new Error(`Action non autorisée : votre rôle ne dispose pas du droit « ${LIBELLE_PERMISSION[permission]} ».`);
}

/** Le département doit exister et le service, s'il est renseigné, lui appartenir */
export function verifierRattachement(db: Database, departement: string, service: string): void {
  const dep = db.departements.find((d) => d.nom === departement);
  if (!dep) throw new Error(`Le département « ${departement} » n'existe pas dans l'organisation.`);
  if (service && !dep.services.some((x) => x.nom === service)) throw new Error(`Le service « ${service} » n'appartient pas au département ${dep.nom}.`);
}

/** Les comptes RH et administrateur ne peuvent être gérés que par un administrateur */
export function exigerSurCompte(user: User, compte: Compte): void {
  if (compte.role !== 'employe' && user.role !== 'admin') throw new Error('Seul un administrateur peut agir sur un compte RH ou administrateur.');
}


export interface Acteur {
  compteId: string | null;
  employeId: string | null;
  nom: string;
  role: Role | 'systeme';
}

export const acteurDe = (user: User): Acteur => ({
  compteId: user.compteId,
  employeId: user.employeId,
  nom: `${user.prenom} ${user.nom}`,
  role: user.role,
});

export const SYSTEME: Acteur = { compteId: null, employeId: null, nom: 'Système', role: 'systeme' };

export function journaliser(db: Database, acteur: Acteur, action: ActionAudit, cible: string, employeId: string | null, details: string) {
  db.audit.push({
    id: uid('a'),
    date: serverNowISO(),
    acteur: acteur.nom,
    acteurRole: acteur.role,
    compteId: acteur.compteId,
    action,
    cible,
    employeId,
    details,
  });
}

export function notifier(db: Database, n: Omit<Notification, 'id' | 'date' | 'lu'>) {
  db.notifications.push({ id: uid('n'), date: serverNowISO(), lu: false, ...n });
}

export const employe = (db: Database, id: string): Employe => {
  const e = db.employes.find((x) => x.id === id);
  if (!e) throw new Error('Collaborateur introuvable.');
  return e;
};
export const nomComplet = (e: Employe) => `${e.prenom} ${e.nom}`;
export const annee = () => dateKey(serverNow()).slice(0, 4);

export function creerDocument(db: Database, emp: Employe, modele: ModeleDocument, params: Record<string, string>, acteur: Acteur): DocumentGenere {
  const doc = construireDocument({
    id: uid('doc'),
    employe: emp,
    modele,
    params,
    dateISO: serverNowISO(),
    generePar: acteur.nom,
    sequence: 900 + db.documents.length,
  });
  db.documents.push(doc);
  journaliser(db, acteur, 'GENERATION_DOCUMENT', doc.reference, emp.id, `${doc.titre} • code ${doc.code}`);
  return doc;
}
