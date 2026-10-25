import { estSorti } from '../metier/contrat';
import { serverNow, serverNowISO } from '../metier/horloge';
import { dateKey } from '../metier/temps';
import type { Database, Departement, User } from '../types';
import { mutate, uid } from './noyau';
import { acteurDe, employe, exiger, journaliser } from './commun';

/* ================= Organisation : départements & services ================= */

export interface DonneesDepartement {
  code: string;
  nom: string;
  description: string;
  responsableId: string | null;
}

const normaliserNom = (s: string) => s.trim().replace(/\s+/g, ' ');

function controlerDepartement(db: Database, d: DonneesDepartement, id: string | null): DonneesDepartement {
  const propre = { ...d, code: d.code.trim().toUpperCase(), nom: normaliserNom(d.nom), description: d.description.trim() };
  if (!propre.nom) throw new Error('Le nom du département est obligatoire.');
  if (!/^[A-Z0-9]{2,6}$/.test(propre.code)) throw new Error('Le code comporte 2 à 6 lettres ou chiffres (ex. RH, FIN).');
  const autres = db.departements.filter((x) => x.id !== id);
  if (autres.some((x) => x.nom.toLowerCase() === propre.nom.toLowerCase())) throw new Error(`Un département « ${propre.nom} » existe déjà.`);
  if (autres.some((x) => x.code === propre.code)) throw new Error(`Le code ${propre.code} est déjà utilisé.`);
  if (propre.responsableId) employe(db, propre.responsableId);
  return propre;
}

export function creerDepartement(user: User, d: DonneesDepartement): Departement {
  return mutate((db) => {
    exiger(db, user, 'organisation.gerer');
    const propre = controlerDepartement(db, d, null);
    const dep: Departement = { id: uid('dep'), ...propre, services: [], dateCreation: serverNowISO() };
    db.departements.push(dep);
    journaliser(db, acteurDe(user), 'CREATION_DEPARTEMENT', `${dep.nom} (${dep.code})`, null, dep.description || 'Nouveau département');
    return { ...dep };
  });
}

/** Renommer un département met à jour les dossiers rattachés et les mutations planifiées (l'historique reste inchangé) */
export function modifierDepartement(user: User, id: string, d: DonneesDepartement): void {
  mutate((db) => {
    exiger(db, user, 'organisation.gerer');
    const dep = db.departements.find((x) => x.id === id);
    if (!dep) throw new Error('Département introuvable.');
    const propre = controlerDepartement(db, d, id);
    const ancien = dep.nom;
    const changes = (['code', 'nom', 'description', 'responsableId'] as const).filter((k) => dep[k] !== propre[k]);
    if (changes.length === 0) return;
    Object.assign(dep, propre);
    let dossiers = 0;
    if (ancien !== dep.nom) {
      db.employes.filter((e) => e.departement === ancien).forEach((e) => {
        e.departement = dep.nom;
        dossiers += 1;
      });
      db.evolutions.filter((ev) => ev.statut === 'planifiee' && ev.apres.departement === ancien).forEach((ev) => (ev.apres.departement = dep.nom));
    }
    journaliser(
      db,
      acteurDe(user),
      'MODIFICATION_DEPARTEMENT',
      dep.nom,
      null,
      `Modifiés : ${changes.join(', ')}${ancien !== dep.nom ? ` • ancien nom « ${ancien} », ${dossiers} dossier(s) mis à jour` : ''}`,
    );
  });
}

export function supprimerDepartement(user: User, id: string): void {
  mutate((db) => {
    exiger(db, user, 'organisation.gerer');
    const dep = db.departements.find((x) => x.id === id);
    if (!dep) throw new Error('Département introuvable.');
    const today = dateKey(serverNow());
    const rattaches = db.employes.filter((e) => e.departement === dep.nom && !estSorti(e, today)).length;
    if (rattaches) throw new Error(`${rattaches} collaborateur(s) sont rattachés à ${dep.nom} : mutez-les vers un autre département avant de le supprimer.`);
    if (db.evolutions.some((ev) => ev.statut === 'planifiee' && ev.apres.departement === dep.nom))
      throw new Error(`Une mutation planifiée vise ${dep.nom} : annulez-la ou modifiez-la d'abord.`);
    db.departements = db.departements.filter((x) => x.id !== id);
    journaliser(db, acteurDe(user), 'SUPPRESSION_DEPARTEMENT', `${dep.nom} (${dep.code})`, null, `${dep.services.length} service(s) supprimé(s)`);
  });
}

export interface DonneesService {
  nom: string;
  responsableId: string | null;
}

function departementDe(db: Database, id: string): Departement {
  const dep = db.departements.find((x) => x.id === id);
  if (!dep) throw new Error('Département introuvable.');
  return dep;
}

function controlerService(dep: Departement, d: DonneesService, id: string | null): DonneesService {
  const nom = normaliserNom(d.nom);
  if (!nom) throw new Error('Le nom du service est obligatoire.');
  if (dep.services.some((x) => x.id !== id && x.nom.toLowerCase() === nom.toLowerCase())) throw new Error(`Le service « ${nom} » existe déjà dans ${dep.nom}.`);
  return { nom, responsableId: d.responsableId };
}

export function ajouterService(user: User, departementId: string, d: DonneesService): void {
  mutate((db) => {
    exiger(db, user, 'organisation.gerer');
    const dep = departementDe(db, departementId);
    const propre = controlerService(dep, d, null);
    if (propre.responsableId) employe(db, propre.responsableId);
    dep.services.push({ id: uid('srv'), ...propre });
    journaliser(db, acteurDe(user), 'CREATION_DEPARTEMENT', `${dep.nom} › ${propre.nom}`, null, 'Nouveau service');
  });
}

export function modifierService(user: User, departementId: string, serviceId: string, d: DonneesService): void {
  mutate((db) => {
    exiger(db, user, 'organisation.gerer');
    const dep = departementDe(db, departementId);
    const srv = dep.services.find((x) => x.id === serviceId);
    if (!srv) throw new Error('Service introuvable.');
    const propre = controlerService(dep, d, serviceId);
    if (propre.responsableId) employe(db, propre.responsableId);
    const ancien = srv.nom;
    if (ancien === propre.nom && srv.responsableId === propre.responsableId) return;
    Object.assign(srv, propre);
    let dossiers = 0;
    if (ancien !== srv.nom)
      db.employes.filter((e) => e.departement === dep.nom && e.service === ancien).forEach((e) => {
        e.service = srv.nom;
        dossiers += 1;
      });
    journaliser(db, acteurDe(user), 'MODIFICATION_DEPARTEMENT', `${dep.nom} › ${srv.nom}`, null, ancien !== srv.nom ? `Renommé (ancien : « ${ancien} »), ${dossiers} dossier(s) mis à jour` : 'Responsable modifié');
  });
}

/** Les collaborateurs du service restent dans le département, sans service */
export function supprimerService(user: User, departementId: string, serviceId: string): number {
  return mutate((db) => {
    exiger(db, user, 'organisation.gerer');
    const dep = departementDe(db, departementId);
    const srv = dep.services.find((x) => x.id === serviceId);
    if (!srv) throw new Error('Service introuvable.');
    const membres = db.employes.filter((e) => e.departement === dep.nom && e.service === srv.nom);
    membres.forEach((e) => (e.service = ''));
    dep.services = dep.services.filter((x) => x.id !== serviceId);
    journaliser(db, acteurDe(user), 'SUPPRESSION_DEPARTEMENT', `${dep.nom} › ${srv.nom}`, null, `${membres.length} collaborateur(s) rattaché(s) directement au département`);
    return membres.length;
  });
}
