import { MOTIFS_PERMISSION } from '../referentiels/paie';
import { ensembleFeries } from '../metier/feries';
import { calculerDroits, disponiblePour, dureeConge, LIBELLE_CONGE } from '../metier/regles';
import { serverNow, serverNowISO } from '../metier/horloge';
import { dateCourte, dateKey, moisDe, moisLong } from '../metier/temps';
import type { DemandeConge, User } from '../types';
import { mutate, uid } from './noyau';
import { acteurDe, creerDocument, employe, exiger, journaliser, nomComplet, notifier } from './commun';
import { verifierLibertePreavis } from './conges.service';

/* ================= Absences justifiées / non justifiées ================= */

export interface Justification {
  type: Exclude<DemandeConge['type'], 'rtt'>;
  motifPermission?: DemandeConge['motifPermission'];
  motif: string;
  justificatif: string | null;
}

/** Transforme une absence non justifiée en absence autorisée (congé validé a posteriori) */
export function justifierAbsence(user: User, employeId: string, debut: string, fin: string, j: Justification): DemandeConge {
  return mutate((db) => {
    exiger(db, user, 'absences.gerer');
    exiger(db, user, j.type === 'permission' ? 'permissions.valider' : 'conges.valider');
    const emp = employe(db, employeId);
    const today = dateKey(serverNow());
    if (fin < debut) throw new Error('La date de fin précède la date de début.');
    if (fin > today) throw new Error('Seules les absences passées ou du jour peuvent être justifiées.');
    if (debut < emp.dateEmbauche) throw new Error("La période commence avant la date d'embauche.");
    if (db.conges.some((c) => c.employeId === employeId && c.statut !== 'refuse' && c.debut <= fin && debut <= c.fin))
      throw new Error('Une demande d’absence existe déjà sur cette période : traitez-la depuis la page Congés.');
    const pointee = db.pointages.find((p) => p.employeId === employeId && p.date >= debut && p.date <= fin);
    if (pointee) throw new Error(`Le collaborateur a pointé le ${dateCourte(pointee.date)} : ce jour n'est pas une absence.`);
    const payee = db.campagnesPaie.find((c) => c.statut !== 'brouillon' && c.mois >= moisDe(debut) && c.mois <= moisDe(fin));
    if (payee) throw new Error(`La paie de ${moisLong(payee.mois)} est déjà validée : la régularisation doit passer par la paie suivante.`);
    const jours = dureeConge(debut, fin, 'matin', 'fin', ensembleFeries(db.parametres));
    if (jours <= 0) throw new Error('La période ne contient aucun jour ouvrable.');
    if (j.type === 'permission') {
      const m = j.motifPermission ? MOTIFS_PERMISSION[j.motifPermission] : undefined;
      if (!m) throw new Error('Précisez l’événement justifiant la permission.');
      if (m.jours !== null && jours > m.jours) throw new Error(`Permission limitée à ${m.jours} j pour cet événement (CCGT art. 54).`);
    }
    if (j.type === 'maladie' && !j.justificatif) throw new Error('Un certificat médical est requis pour une absence maladie.');
    if (j.type === 'maternite') throw new Error('Le congé de maternité se déclare depuis la page Congés (période fixée par la loi).');
    if (j.type === 'liberte_preavis') verifierLibertePreavis(db, emp, debut, fin, jours);
    if (j.type === 'conge_paye') {
      const dispo = disponiblePour(calculerDroits(db, emp, today), 'conge_paye')!;
      if (jours > dispo) throw new Error(`Solde de congés insuffisant : ${dispo} j disponible(s).`);
    }
    if (!j.motif.trim()) throw new Error('Indiquez le motif de la justification.');
    const acteur = acteurDe(user);
    const c: DemandeConge = {
      id: uid('cg'),
      reference: `CG-${debut.slice(0, 4)}-${String(db.conges.length + 8).padStart(4, '0')}`,
      employeId,
      type: j.type,
      ...(j.type === 'permission' ? { motifPermission: j.motifPermission } : {}),
      debut,
      debutPeriode: 'matin',
      fin,
      finPeriode: 'fin',
      jours,
      motif: j.motif.trim(),
      justificatif: j.justificatif,
      statut: 'approuve',
      dateDemande: serverNowISO(),
      validateur: acteur.nom,
      traitePar: acteur.nom,
      dateTraitement: serverNowISO(),
      commentaireRH: 'Absence justifiée a posteriori',
    };
    db.conges.push(c);
    journaliser(db, acteur, 'JUSTIFICATION_ABSENCE', c.reference, emp.id, `${LIBELLE_CONGE[c.type]} • ${jours} j du ${dateCourte(debut)} au ${dateCourte(fin)} • ${c.motif}`);
    if (c.type !== 'maladie') creerDocument(db, emp, 'titre_conge', { congeId: c.id, periode: `${dateCourte(c.debut)} — ${dateCourte(c.fin)}`, jours: String(c.jours) }, acteur);
    notifier(db, {
      pour: { employeId },
      titre: 'Absence justifiée',
      message: `${dateCourte(debut)}${fin !== debut ? ` — ${dateCourte(fin)}` : ''} : ${LIBELLE_CONGE[c.type]}`,
      lien: '/employe/conges',
      niveau: 'succes',
    });
    return { ...c };
  });
}

/** Demande au collaborateur de justifier une absence (notification + trace) */
export function relancerAbsence(user: User, employeId: string, jours: string[]): void {
  mutate((db) => {
    exiger(db, user, 'absences.gerer');
    const emp = employe(db, employeId);
    if (jours.length === 0) throw new Error('Aucune absence à relancer.');
    const liste = jours.map(dateCourte).join(', ');
    journaliser(db, acteurDe(user), 'RELANCE_ABSENCE', nomComplet(emp), emp.id, `Absence(s) non justifiée(s) : ${liste}`);
    notifier(db, {
      pour: { employeId },
      titre: 'Absence à justifier',
      message: `Aucun pointage ni congé le ${liste}. Déposez une régularisation ou un justificatif.`,
      lien: '/employe/pointages',
      niveau: 'alerte',
    });
  });
}
