import { MOTIFS_SORTIE } from '../referentiels/paie';
import { calculerSortie, type SaisieSortie } from '../metier/sortie';
import { materniteProtegee } from '../metier/maternite';
import { fcfa } from '../metier/paie';
import { serverNow, serverNowISO } from '../metier/horloge';
import { dateCourte, dateKey, moisDe, moisLong } from '../metier/temps';
import type { Database, Sortie, User } from '../types';
import { getDB, mutate, uid } from './noyau';
import { Acteur, SYSTEME, acteurDe, creerDocument, employe, exiger, exigerSurCompte, journaliser, nomComplet, notifier } from './commun';
import { calculerLignes } from './paie.service';

/* ================= Sortie du salarié ================= */

export interface NouvelleSortie extends SaisieSortie {
  observations: string;
}

/** Recalcule les droits d'une sortie (salaire moyen, congés, indemnités) à partir des données à jour */
export function actualiserCalculSortie(db: Database, sortie: Sortie, todayKey: string): void {
  const emp = employe(db, sortie.employeId);
  const calc = calculerSortie(db, { ...emp, dateSortie: null }, sortie, todayKey);
  Object.assign(sortie, {
    dateFinPreavis: calc.dateFinPreavis,
    salaireMoyen: calc.salaireMoyen,
    ancienneteAnnees: calc.ancienneteAnnees,
    joursCongesRestants: calc.joursCongesRestants,
    rubriques: calc.rubriques,
    montantDuParSalarie: calc.montantDuParSalarie,
  });
}

/** Sortie effective : accès désactivé, certificat de travail délivré (CT art. 62) */
function rendreSortieEffective(db: Database, sortie: Sortie, acteur: Acteur): void {
  const emp = employe(db, sortie.employeId);
  sortie.statut = 'effective';
  const compte = db.comptes.find((c) => c.employeId === emp.id);
  if (compte) compte.actif = false;
  const certificat = creerDocument(db, emp, 'certificat_travail', { sortieId: sortie.id, dateSortie: dateCourte(sortie.dateSortie) }, acteur);
  sortie.certificatId = certificat.id;
  journaliser(db, acteur, 'APPLICATION_SORTIE', nomComplet(emp), emp.id, `${MOTIFS_SORTIE[sortie.motif].libelle} • dernier jour ${dateCourte(sortie.dateSortie)} • accès désactivé, certificat ${certificat.reference}`);
  notifier(db, {
    pour: { role: 'rh' },
    titre: 'Sortie effective',
    message: `${nomComplet(emp)} — certificat de travail ${certificat.reference} à remettre`,
    lien: `/rh/employes/${emp.id}`,
    niveau: 'info',
  });
}

export function enregistrerSortie(user: User, employeId: string, d: NouvelleSortie): Sortie {
  return mutate((db) => {
    exiger(db, user, 'collaborateurs.gerer');
    const emp = employe(db, employeId);
    const compte = db.comptes.find((c) => c.employeId === employeId);
    if (employeId === user.employeId) throw new Error('Vous ne pouvez pas enregistrer votre propre sortie.');
    if (compte) exigerSurCompte(user, compte);
    if (compte?.role === 'admin' && db.comptes.filter((c) => c.role === 'admin' && c.actif).length <= 1)
      throw new Error('Impossible : il doit rester au moins un administrateur actif.');
    if (db.sorties.some((x) => x.employeId === employeId && x.statut !== 'annulee')) throw new Error('Une sortie est déjà enregistrée pour ce collaborateur.');
    if (d.dateSortie < emp.dateEmbauche) throw new Error("La date de sortie précède la date d'embauche.");
    if (d.dateNotification > d.dateSortie) throw new Error('La notification doit précéder ou coïncider avec la date de sortie.');
    const verrouillee = db.campagnesPaie.find((c) => c.statut !== 'brouillon' && c.mois >= moisDe(d.dateSortie));
    if (verrouillee) throw new Error(`La paie de ${moisLong(verrouillee.mois)} est déjà validée : la sortie doit intervenir après ce mois.`);
    const regle = MOTIFS_SORTIE[d.motif];
    // Aucun licenciement pendant la grossesse ou le congé de maternité, hors faute lourde non liée à la grossesse (CT art. 171)
    const protegee = regle.initiative === 'employeur' && d.motif !== 'faute_lourde' ? materniteProtegee(db, employeId, d.dateNotification, d.dateSortie) : undefined;
    if (protegee)
      throw new Error(`Licenciement interdit : congé de maternité du ${dateCourte(protegee.debut)} au ${dateCourte(protegee.fin)} (CT art. 171, dommages et intérêts d'au moins 12 mois de salaire, art. 172).`);
    if (regle.preavis && d.preavis === 'sans_objet') throw new Error('Précisez comment le préavis est exécuté.');
    const today = dateKey(serverNow());
    const calc = calculerSortie(db, emp, d, today);
    const acteur = acteurDe(user);
    const sortie: Sortie = {
      id: uid('so'),
      reference: `SO-${d.dateSortie.slice(0, 4)}-${String(db.sorties.length + 1).padStart(4, '0')}`,
      employeId,
      motif: d.motif,
      dateNotification: d.dateNotification,
      dateSortie: d.dateSortie,
      preavis: regle.preavis ? d.preavis : 'sans_objet',
      joursLiberteNonUtilises: d.joursLiberteNonUtilises ?? 0,
      dateFinPreavis: calc.dateFinPreavis,
      salaireMoyen: calc.salaireMoyen,
      ancienneteAnnees: calc.ancienneteAnnees,
      joursCongesRestants: calc.joursCongesRestants,
      rubriques: calc.rubriques,
      montantDuParSalarie: calc.montantDuParSalarie,
      observations: d.observations.trim(),
      statut: 'planifiee',
      creePar: acteur.nom,
      dateCreation: serverNowISO(),
      certificatId: null,
      soldeId: null,
    };
    db.sorties.push(sortie);
    emp.dateSortie = d.dateSortie;

    // Demandes et évolutions postérieures à la sortie : sans objet
    db.conges
      .filter((c) => c.employeId === employeId && c.statut !== 'refuse' && c.debut > d.dateSortie)
      .forEach((c) => {
        c.statut = 'refuse';
        c.traitePar = acteur.nom;
        c.dateTraitement = serverNowISO();
        c.commentaireRH = `Sans objet : sortie du collaborateur le ${dateCourte(d.dateSortie)}`;
      });
    db.evolutions = db.evolutions.filter((ev) => !(ev.employeId === employeId && ev.statut === 'planifiee' && ev.dateEffet > d.dateSortie));

    journaliser(db, acteur, 'SORTIE_EMPLOYE', sortie.reference, emp.id, `${regle.libelle} • notifiée le ${dateCourte(d.dateNotification)} • dernier jour ${dateCourte(d.dateSortie)} • indemnités ${fcfa(calc.total)}`);
    // Une paie en préparation du mois de sortie est recalculée immédiatement
    const brouillon = db.campagnesPaie.find((c) => c.statut === 'brouillon' && c.mois === moisDe(d.dateSortie));
    if (brouillon) brouillon.lignes = calculerLignes(db, brouillon.mois, brouillon.lignes);
    if (d.dateSortie < today) rendreSortieEffective(db, sortie, acteur);
    return { ...sortie };
  });
}

/** Annulation possible tant que la sortie n'est pas effective */
export function annulerSortie(user: User, sortieId: string, motif: string): void {
  mutate((db) => {
    exiger(db, user, 'collaborateurs.gerer');
    const sortie = db.sorties.find((x) => x.id === sortieId);
    if (!sortie || sortie.statut === 'annulee') throw new Error('Sortie introuvable.');
    if (sortie.statut === 'effective') throw new Error('La sortie est effective : un retour dans l’entreprise nécessite une nouvelle embauche.');
    if (!motif.trim()) throw new Error("Indiquez le motif de l'annulation.");
    const emp = employe(db, sortie.employeId);
    sortie.statut = 'annulee';
    emp.dateSortie = null;
    const brouillon = db.campagnesPaie.find((c) => c.statut === 'brouillon' && c.mois === moisDe(sortie.dateSortie));
    if (brouillon) brouillon.lignes = calculerLignes(db, brouillon.mois, brouillon.lignes);
    journaliser(db, acteurDe(user), 'ANNULATION_SORTIE', sortie.reference, emp.id, motif.trim());
  });
}

/** Rend effectives les sorties dont le dernier jour est passé (appelé au chargement de l'application) */
export function appliquerSortiesEchues(): number {
  const today = dateKey(serverNow());
  if (!getDB().sorties.some((x) => x.statut === 'planifiee' && x.dateSortie < today)) return 0;
  return mutate((db) => {
    const echues = db.sorties.filter((x) => x.statut === 'planifiee' && x.dateSortie < today);
    echues.forEach((x) => rendreSortieEffective(db, x, SYSTEME));
    return echues.length;
  });
}
