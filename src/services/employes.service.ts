import { controleSmig, situationActuelle } from '../metier/paie';
import { serverNow, serverNowISO } from '../metier/horloge';
import { dateKey } from '../metier/temps';
import type { Database, Employe, Role, User } from '../types';
import { mutate, uid } from './noyau';
import { acteurDe, employe, exiger, exigerSurCompte, journaliser, nomComplet, notifier, verifierRattachement } from './commun';

/* ================= Profil & collaborateurs ================= */

export type Coordonnees = Pick<Employe, 'telPerso' | 'emailPerso' | 'adresse' | 'urgenceNom' | 'urgenceTel'>;

const LIBELLES_CHAMPS: Partial<Record<keyof Employe, string>> = {
  telPerso: 'téléphone personnel',
  emailPerso: 'email personnel',
  adresse: 'adresse',
  urgenceNom: "contact d'urgence",
  urgenceTel: "téléphone d'urgence",
  poste: 'poste',
  departement: 'département',
  contrat: 'contrat',
  categorie: 'catégorie professionnelle',
  enfantsACharge: 'enfants à charge',
  service: 'service',
  avantagesNature: 'avantages en nature',
  dirigeant: 'barème dirigeant',
  premierEmploi: 'premier emploi (VPS)',
  salaireBase: 'salaire',
  compteBancaire: 'compte bancaire',
  cnss: 'CNSS',
  ifu: 'IFU',
  npi: 'NPI',
  responsable: 'responsable',
};

function champsModifies(avant: Employe, patch: Partial<Employe>): string[] {
  return (Object.keys(patch) as (keyof Employe)[])
    .filter((k) => patch[k] !== undefined && JSON.stringify(patch[k]) !== JSON.stringify(avant[k]))
    .map((k) => LIBELLES_CHAMPS[k] ?? k);
}

export function modifierCoordonnees(user: User, c: Coordonnees): void {
  mutate((db) => {
    const emp = employe(db, user.employeId);
    const champs = champsModifies(emp, c);
    if (champs.length === 0) return;
    Object.assign(emp, c);
    journaliser(db, acteurDe(user), 'MODIFICATION_PROFIL', nomComplet(emp), emp.id, `Champs : ${champs.join(', ')}`);
    notifier(db, {
      pour: { role: 'rh' },
      titre: 'Coordonnées mises à jour',
      message: `${nomComplet(emp)} — ${champs.join(', ')}`,
      lien: `/rh/employes/${emp.id}`,
      niveau: 'info',
    });
  });
}

export type NouvelEmploye = Omit<Employe, 'id' | 'matricule' | 'avatarUrl' | 'npiVerifie' | 'dateSortie'>;

export function creerEmploye(user: User, data: NouvelEmploye, role: Role): { employe: Employe; motDePasse: string } {
  return mutate((db) => {
    exiger(db, user, 'collaborateurs.gerer');
    if (role !== 'employe' && user.role !== 'admin') throw new Error('Seul un administrateur peut attribuer le rôle RH ou administrateur.');
    verifierRattachement(db, data.departement, data.service);
    const smig = controleSmig(data.salaireBase, data.heuresHebdo, data.contrat);
    if (smig) throw new Error(smig);
    const email = data.emailPro.trim().toLowerCase();
    if (db.comptes.some((c) => c.email.toLowerCase() === email)) throw new Error('Un compte existe déjà avec cet email professionnel.');
    const numeros = db.employes.map((e) => Number(e.matricule.replace(/\D/g, ''))).filter(Boolean);
    const matricule = `BN-${String(Math.max(...numeros, 4500) + 1).padStart(4, '0')}`;
    const emp: Employe = { ...data, emailPro: email, id: uid('e'), matricule, avatarUrl: '', npiVerifie: false, dateSortie: null };
    db.evolutions.push({
      id: uid('ev'),
      reference: `EV-${emp.dateEmbauche.slice(0, 4)}-${String(db.evolutions.length + 1).padStart(4, '0')}`,
      employeId: emp.id,
      type: 'embauche',
      dateEffet: emp.dateEmbauche,
      avant: null,
      apres: situationActuelle(emp),
      motif: `Embauche en ${emp.contrat}`,
      decidePar: acteurDe(user).nom,
      dateDecision: serverNowISO(),
      statut: emp.dateEmbauche <= dateKey(serverNow()) ? 'appliquee' : 'planifiee',
      documentId: null,
    });
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
    const motDePasse = `Sika-${Array.from(crypto.getRandomValues(new Uint32Array(10)), (n) => alphabet[n % alphabet.length]).join('')}`;
    db.employes.push(emp);
    db.comptes.push({
      id: uid('c'),
      email,
      motDePasse,
      role,
      employeId: emp.id,
      actif: true,
      tentativesEchouees: 0,
      verrouilleJusqua: null,
      derniereConnexion: null,
    });
    journaliser(db, acteurDe(user), 'CREATION_EMPLOYE', `${nomComplet(emp)} (${matricule})`, emp.id, `${emp.poste} • ${emp.departement} • rôle ${role}`);
    return { employe: { ...emp }, motDePasse };
  });
}

/** Champs modifiables uniquement par une évolution de carrière (pour garder l'historique) */
const CHAMPS_CARRIERE: (keyof Employe)[] = ['poste', 'departement', 'salaireBase', 'primesFixes'];

export function modifierEmploye(user: User, id: string, patchBrut: Partial<Employe>): void {
  const patch = { ...patchBrut };
  CHAMPS_CARRIERE.forEach((k) => delete patch[k]);
  // La date de sortie ne se modifie que par l'enregistrement d'une sortie
  delete patch.dateSortie;
  mutate((db) => {
    exiger(db, user, 'collaborateurs.gerer');
    const emp = employe(db, id);
    if (patch.service !== undefined) verifierRattachement(db, emp.departement, patch.service);
    if (patch.heuresHebdo !== undefined || patch.contrat !== undefined) {
      const smig = controleSmig(emp.salaireBase, patch.heuresHebdo ?? emp.heuresHebdo, patch.contrat ?? emp.contrat);
      if (smig) throw new Error(smig);
    }
    const champs = champsModifies(emp, patch);
    if (champs.length === 0) return;
    Object.assign(emp, patch);
    const compte = db.comptes.find((c) => c.employeId === id);
    if (compte && patch.emailPro) compte.email = patch.emailPro.trim().toLowerCase();
    journaliser(db, acteurDe(user), 'MODIFICATION_EMPLOYE', nomComplet(emp), emp.id, `Champs : ${champs.join(', ')}`);
    notifier(db, {
      pour: { employeId: emp.id },
      titre: 'Dossier mis à jour par les RH',
      message: champs.join(', '),
      lien: '/employe/profil',
      niveau: 'info',
    });
  });
}

export function changerAcces(user: User, employeId: string, actif: boolean): void {
  mutate((db) => {
    exiger(db, user, 'comptes.gerer');
    const compte = db.comptes.find((c) => c.employeId === employeId);
    if (!compte) throw new Error('Aucun compte associé.');
    if (compte.id === user.compteId) throw new Error('Vous ne pouvez pas désactiver votre propre accès.');
    exigerSurCompte(user, compte);
    if (!actif && compte.role === 'admin' && db.comptes.filter((c) => c.role === 'admin' && c.actif).length <= 1)
      throw new Error('Impossible : il doit rester au moins un administrateur actif.');
    compte.actif = actif;
    if (actif) {
      compte.verrouilleJusqua = null;
      compte.tentativesEchouees = 0;
    }
    const emp = employe(db, employeId);
    journaliser(db, acteurDe(user), actif ? 'ACTIVATION_COMPTE' : 'DESACTIVATION_COMPTE', compte.email, emp.id, nomComplet(emp));
  });
}

export function deverrouillerCompte(user: User, employeId: string): void {
  mutate((db) => {
    exiger(db, user, 'comptes.gerer');
    const compte = db.comptes.find((c) => c.employeId === employeId);
    if (!compte) throw new Error('Aucun compte associé.');
    exigerSurCompte(user, compte);
    compte.verrouilleJusqua = null;
    compte.tentativesEchouees = 0;
    const emp = employe(db, employeId);
    journaliser(db, acteurDe(user), 'DEVERROUILLAGE_COMPTE', compte.email, emp.id, nomComplet(emp));
    notifier(db, {
      pour: { employeId },
      titre: 'Compte déverrouillé',
      message: 'Le service RH a rétabli votre accès. Vous pouvez vous reconnecter.',
      niveau: 'info',
    });
  });
}

/** Génère un mot de passe temporaire (affiché une seule fois au RH) */
export function reinitialiserMotDePasse(user: User, employeId: string): { email: string; motDePasse: string } {
  return mutate((db) => {
    exiger(db, user, 'comptes.gerer');
    const compte = db.comptes.find((c) => c.employeId === employeId);
    if (!compte) throw new Error('Aucun compte associé.');
    if (compte.id === user.compteId) throw new Error('Utilisez la procédure « Mot de passe oublié » pour votre propre compte.');
    exigerSurCompte(user, compte);
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
    const aleatoire = crypto.getRandomValues(new Uint32Array(10));
    const motDePasse = `Sika-${Array.from(aleatoire, (n) => alphabet[n % alphabet.length]).join('')}`;
    compte.motDePasse = motDePasse;
    compte.verrouilleJusqua = null;
    compte.tentativesEchouees = 0;
    const emp = employe(db, employeId);
    journaliser(db, acteurDe(user), 'REINITIALISATION_MOT_DE_PASSE', compte.email, emp.id, 'Mot de passe temporaire généré');
    return { email: compte.email, motDePasse };
  });
}

export function consulterDonneesSensibles(user: User, employeId: string): void {
  mutate((db) => {
    exiger(db, user, 'donnees_sensibles.consulter');
    const emp = employe(db, employeId);
    journaliser(db, acteurDe(user), 'CONSULTATION_DONNEES_SENSIBLES', nomComplet(emp), emp.id, 'Affichage CNSS, IFU, NPI, compte bancaire et salaire');
  });
}

/* ================= Suppression d'un collaborateur ================= */

/**
 * Motifs empêchant la suppression : les bulletins, documents et registres de présence doivent être conservés.
 * La suppression est réservée aux dossiers créés par erreur ; sinon, désactiver l'accès.
 */
export function motifsBlocageSuppression(db: Database, employeId: string): string[] {
  const motifs: string[] = [];
  const paies = db.campagnesPaie.filter((c) => c.lignes.some((l) => l.employeId === employeId)).length;
  if (paies) motifs.push(`${paies} paie(s) calculée(s) ou versée(s)`);
  const docs = db.documents.filter((d) => d.employeId === employeId).length;
  if (docs) motifs.push(`${docs} document(s) certifié(s)`);
  const pointages = db.pointages.filter((p) => p.employeId === employeId).length;
  if (pointages) motifs.push(`${pointages} pointage(s) au registre de présence`);
  const conges = db.conges.filter((c) => c.employeId === employeId && c.statut === 'approuve').length;
  if (conges) motifs.push(`${conges} absence(s) validée(s)`);
  if (db.evolutions.some((ev) => ev.employeId === employeId && ev.type !== 'embauche' && ev.statut === 'appliquee')) motifs.push('des évolutions de carrière appliquées');
  return motifs;
}

export function supprimerEmploye(user: User, employeId: string, motif: string): void {
  mutate((db) => {
    exiger(db, user, 'collaborateurs.supprimer');
    const emp = employe(db, employeId);
    const compte = db.comptes.find((c) => c.employeId === employeId);
    if (compte?.id === user.compteId) throw new Error('Vous ne pouvez pas supprimer votre propre dossier.');
    if (compte) exigerSurCompte(user, compte);
    if (compte?.role === 'admin' && db.comptes.filter((c) => c.role === 'admin' && c.actif).length <= 1)
      throw new Error('Impossible : il doit rester au moins un administrateur actif.');
    const blocages = motifsBlocageSuppression(db, employeId);
    if (blocages.length) throw new Error(`Suppression impossible (${blocages.join(', ')}) : ces données doivent être conservées. Désactivez plutôt l'accès.`);
    if (!motif.trim()) throw new Error('Indiquez le motif de la suppression.');
    db.employes = db.employes.filter((e) => e.id !== employeId);
    db.comptes = db.comptes.filter((c) => c.employeId !== employeId);
    db.evolutions = db.evolutions.filter((ev) => ev.employeId !== employeId);
    db.conges = db.conges.filter((c) => c.employeId !== employeId);
    db.regularisations = db.regularisations.filter((r) => r.employeId !== employeId);
    db.demandesDocuments = db.demandesDocuments.filter((d) => d.employeId !== employeId);
    db.notifications = db.notifications.filter((n) => n.pour.employeId !== employeId);
    db.departements.forEach((d) => {
      if (d.responsableId === employeId) d.responsableId = null;
      d.services.forEach((x) => {
        if (x.responsableId === employeId) x.responsableId = null;
      });
    });
    // L'entrée d'audit est conservée (traçabilité), sans lien vers un dossier qui n'existe plus
    journaliser(db, acteurDe(user), 'SUPPRESSION_EMPLOYE', `${nomComplet(emp)} (${emp.matricule})`, null, motif.trim());
  });
}
