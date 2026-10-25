import { MOTIFS_PERMISSION } from '../referentiels/paie';
import { joursCalendaires, periodeMaternite } from '../metier/maternite';
import { ensembleFeries } from '../metier/feries';
import { calculerDroits, disponiblePour, dureeConge, LIBELLE_CONGE } from '../metier/regles';
import { serverNow, serverNowISO } from '../metier/horloge';
import { ajouterJours, dateCourte, dateKey, lundi } from '../metier/temps';
import type { Database, DemandeConge, Employe, User } from '../types';
import { mutate, uid } from './noyau';
import { acteurDe, annee, creerDocument, employe, exiger, journaliser, nomComplet, notifier } from './commun';

/* ================= Congés ================= */

export interface NouvelleDemandeConge {
  type: DemandeConge['type'];
  motifPermission?: DemandeConge['motifPermission'];
  dateAccouchementPresumee?: string;
  debut: string;
  debutPeriode: DemandeConge['debutPeriode'];
  fin: string;
  finPeriode: DemandeConge['finPeriode'];
  motif: string;
  justificatif: string | null;
}

/**
 * Jours de liberté pour rechercher un emploi pendant le préavis : 2 jours ouvrables par semaine, payés (CT art. 54, CCGT art. 31).
 * Uniquement pendant un préavis effectué.
 */
export function verifierLibertePreavis(db: Database, emp: Employe, debut: string, fin: string, jours: number, ignorer?: string): void {
  const sortie = db.sorties.find((x) => x.employeId === emp.id && x.statut === 'planifiee' && x.preavis === 'effectue');
  if (!sortie) throw new Error('Les jours de liberté ne s’appliquent que pendant un préavis effectué.');
  if (debut < sortie.dateNotification || fin > sortie.dateSortie)
    throw new Error(`Les jours de liberté doivent se situer pendant le préavis, du ${dateCourte(sortie.dateNotification)} au ${dateCourte(sortie.dateSortie)}.`);
  if (lundi(debut) !== lundi(fin)) throw new Error('Saisissez les jours de liberté semaine par semaine (2 jours au plus par semaine).');
  const dejaPris = db.conges
    .filter((c) => c.id !== ignorer && c.employeId === emp.id && c.type === 'liberte_preavis' && c.statut !== 'refuse' && lundi(c.debut) === lundi(debut))
    .reduce((t, c) => t + c.jours, 0);
  if (dejaPris + jours > 2) throw new Error(`2 jours de liberté au plus par semaine (déjà ${dejaPris} j cette semaine).`);
}

export function demanderConge(user: User, d: NouvelleDemandeConge): DemandeConge {
  return mutate((db) => {
    const emp = employe(db, user.employeId);
    // Congé de maternité : période fixée par la loi à partir de la date présumée d'accouchement (CT art. 170)
    if (d.type === 'maternite') {
      if (emp.civilite !== 'Mme') throw new Error('Le congé de maternité concerne les salariées.');
      if (!d.dateAccouchementPresumee) throw new Error("Indiquez la date présumée de l'accouchement.");
      if (!d.justificatif) throw new Error("Joignez le certificat médical constatant la grossesse et la date présumée d'accouchement.");
      d = { ...d, ...periodeMaternite(d.dateAccouchementPresumee), debutPeriode: 'matin', finPeriode: 'fin' };
    }
    const jours = d.type === 'maternite' ? joursCalendaires(d.debut, d.fin) : dureeConge(d.debut, d.fin, d.debutPeriode, d.finPeriode, ensembleFeries(db.parametres));
    if (jours <= 0) throw new Error('La période choisie ne contient aucun jour ouvrable.');
    if (d.type === 'liberte_preavis') verifierLibertePreavis(db, emp, d.debut, d.fin, jours);
    const chevauche = db.conges.some(
      (c) => c.employeId === emp.id && c.statut !== 'refuse' && c.debut <= d.fin && d.debut <= c.fin,
    );
    if (chevauche) throw new Error('Cette période chevauche une demande existante.');
    if (d.type === 'rtt') throw new Error('Les heures supplémentaires sont payées (CT art. 147) : aucune récupération RTT.');
    if (d.type === 'permission') {
      const motif = d.motifPermission ? MOTIFS_PERMISSION[d.motifPermission] : undefined;
      if (!motif) throw new Error('Précisez l’événement justifiant la permission.');
      if (motif.jours !== null && jours > motif.jours) throw new Error(`Permission limitée à ${motif.jours} j pour cet événement (CCGT art. 54).`);
    }
    const disponible = disponiblePour(calculerDroits(db, emp, dateKey(serverNow())), d.type);
    if (disponible !== null && jours > disponible)
      throw new Error(`Solde insuffisant : ${disponible} j disponible(s), demandes en attente déduites.`);
    const c: DemandeConge = {
      id: uid('cg'),
      reference: `CG-${annee()}-${String(db.conges.length + 8).padStart(4, '0')}`,
      employeId: emp.id,
      ...d,
      jours,
      statut: 'en_attente',
      dateDemande: serverNowISO(),
      validateur: 'Direction RH',
      traitePar: null,
      dateTraitement: null,
      commentaireRH: '',
    };
    db.conges.push(c);
    journaliser(db, acteurDe(user), 'DEMANDE_CONGE', c.reference, emp.id, `${LIBELLE_CONGE[c.type]} • ${jours} j du ${dateCourte(c.debut)} au ${dateCourte(c.fin)}`);
    notifier(db, {
      pour: { role: 'rh' },
      titre: 'Nouvelle demande de congé',
      message: `${nomComplet(emp)} — ${LIBELLE_CONGE[c.type]} (${jours} j)`,
      lien: '/rh/conges',
      niveau: 'info',
    });
    return { ...c };
  });
}

export function deciderConge(user: User, id: string, approuve: boolean, commentaire: string): void {
  mutate((db) => {
    const c = db.conges.find((x) => x.id === id);
    if (!c || c.statut !== 'en_attente') throw new Error('Demande déjà traitée.');
    exiger(db, user, c.type === 'permission' ? 'permissions.valider' : 'conges.valider');
    const acteur = acteurDe(user);
    const emp = employe(db, c.employeId);
    c.statut = approuve ? 'approuve' : 'refuse';
    c.traitePar = acteur.nom;
    c.dateTraitement = serverNowISO();
    c.commentaireRH = commentaire;
    journaliser(db, acteur, approuve ? 'VALIDATION_CONGE' : 'REFUS_CONGE', c.reference, emp.id, commentaire || `${LIBELLE_CONGE[c.type]} • ${c.jours} j`);

    // Génération automatique du titre de congé signé
    if (approuve && c.type !== 'maladie') {
      creerDocument(db, emp, 'titre_conge', { congeId: c.id, periode: `${dateCourte(c.debut)} — ${dateCourte(c.fin)}`, jours: String(c.jours) }, acteur);
    }
    notifier(db, {
      pour: { employeId: emp.id },
      titre: approuve ? `Congé ${c.debut.slice(8, 10)}/${c.debut.slice(5, 7)} approuvé` : 'Demande de congé refusée',
      message: approuve
        ? c.type !== 'maladie'
          ? 'Titre de congé disponible dans vos documents'
          : 'Validation RH confirmée'
        : commentaire || 'Contactez le service RH pour plus de détails',
      lien: approuve && c.type !== 'maladie' ? '/employe/documents' : '/employe/conges',
      niveau: approuve ? 'succes' : 'alerte',
    });
  });
}

/** Déclaration de la date réelle d'accouchement : ajuste la fin du congé (CT art. 170) */
export function declarerAccouchement(user: User, congeId: string, dateAccouchement: string): DemandeConge {
  return mutate((db) => {
    exiger(db, user, 'conges.valider');
    const c = db.conges.find((x) => x.id === congeId);
    if (!c || c.type !== 'maternite' || c.statut !== 'approuve') throw new Error('Congé de maternité validé introuvable.');
    if (!c.dateAccouchementPresumee) throw new Error("Date présumée d'accouchement manquante.");
    if (dateAccouchement > dateKey(serverNow())) throw new Error("La date d'accouchement ne peut pas être future.");
    if (dateAccouchement < c.debut) throw new Error('La date d’accouchement précède le début du congé : vérifiez la date présumée.');
    const { fin } = periodeMaternite(c.dateAccouchementPresumee, dateAccouchement, c.prolongationMaladie);
    const conflit = db.conges.find((x) => x.id !== c.id && x.employeId === c.employeId && x.statut !== 'refuse' && x.debut <= fin && c.debut <= x.fin);
    if (conflit) throw new Error(`Le congé prolongé chevauche la demande ${conflit.reference} : traitez-la d'abord.`);
    c.dateAccouchement = dateAccouchement;
    c.fin = fin;
    c.jours = joursCalendaires(c.debut, fin);
    const emp = employe(db, c.employeId);
    journaliser(db, acteurDe(user), 'VALIDATION_CONGE', c.reference, emp.id, `Accouchement le ${dateCourte(dateAccouchement)} • reprise le ${dateCourte(ajouterJours(fin, 1))} (CT art. 170)`);
    notifier(db, {
      pour: { employeId: emp.id },
      titre: 'Congé de maternité mis à jour',
      message: `Reprise prévue le ${dateCourte(ajouterJours(fin, 1))}`,
      lien: '/employe/conges',
      niveau: 'info',
    });
    return { ...c };
  });
}

/** Prolongation de 4 semaines pour maladie résultant de la grossesse ou des couches (CT art. 170) */
export function prolongerMaternite(user: User, congeId: string, justificatif: string): DemandeConge {
  return mutate((db) => {
    exiger(db, user, 'conges.valider');
    const c = db.conges.find((x) => x.id === congeId);
    if (!c || c.type !== 'maternite' || c.statut !== 'approuve') throw new Error('Congé de maternité validé introuvable.');
    if (c.prolongationMaladie) throw new Error('La prolongation de 4 semaines a déjà été accordée.');
    if (!justificatif) throw new Error('Un certificat médical est requis pour la prolongation.');
    const fin = ajouterJours(c.fin, 28);
    const conflit = db.conges.find((x) => x.id !== c.id && x.employeId === c.employeId && x.statut !== 'refuse' && x.debut <= fin && c.debut <= x.fin);
    if (conflit) throw new Error(`La prolongation chevauche la demande ${conflit.reference} : traitez-la d'abord.`);
    c.prolongationMaladie = true;
    c.fin = fin;
    c.jours = joursCalendaires(c.debut, fin);
    c.justificatif = c.justificatif ? `${c.justificatif}, ${justificatif}` : justificatif;
    const emp = employe(db, c.employeId);
    journaliser(db, acteurDe(user), 'VALIDATION_CONGE', c.reference, emp.id, `Prolongation de 4 semaines pour maladie • reprise le ${dateCourte(ajouterJours(fin, 1))}`);
    notifier(db, { pour: { employeId: emp.id }, titre: 'Congé de maternité prolongé', message: `Reprise prévue le ${dateCourte(ajouterJours(fin, 1))}`, lien: '/employe/conges', niveau: 'info' });
    return { ...c };
  });
}
