import { calculerLignePaie, campagneDuMois, employesAPayer, fcfa, totaux } from '../metier/paie';
import { serverNow, serverNowISO } from '../metier/horloge';
import { dateCourte, dateKey, heureHM, instant, moisDe, moisLong } from '../metier/temps';
import type { Database, CampagnePaie, ElementVariable, User } from '../types';
import { mutate, uid } from './noyau';
import { acteurDe, creerDocument, employe, exiger, journaliser, notifier } from './commun';
import { actualiserCalculSortie } from './sorties.service';

/* ================= Paie ================= */

export function calculerLignes(db: Database, mois: string, anciennes: CampagnePaie['lignes'] = []) {
  const todayKey = dateKey(serverNow());
  // Les indemnités de sortie du mois sont recalculées avec les dernières paies versées
  db.sorties
    .filter((x) => x.statut !== 'annulee' && moisDe(x.dateSortie) === mois)
    .forEach((x) => actualiserCalculSortie(db, x, todayKey));
  return employesAPayer(db, mois)
    .map((e) => calculerLignePaie(db, e, mois, { todayKey, elements: anciennes.find((l) => l.employeId === e.id)?.elements ?? [] }))
    .filter((l): l is NonNullable<typeof l> => l !== null);
}

const campagne = (db: Database, id: string): CampagnePaie => {
  const c = db.campagnesPaie.find((x) => x.id === id);
  if (!c) throw new Error('Campagne de paie introuvable.');
  return c;
};

export function preparerPaie(user: User, mois: string): CampagnePaie {
  return mutate((db) => {
    exiger(db, user, 'paie.gerer');
    if (mois > moisDe(dateKey(serverNow()))) throw new Error('Impossible de préparer la paie d’un mois futur.');
    if (campagneDuMois(db, mois)) throw new Error(`La paie de ${moisLong(mois)} existe déjà.`);
    const c: CampagnePaie = {
      id: uid('pay'),
      reference: `PAIE-${mois}`,
      mois,
      statut: 'brouillon',
      lignes: calculerLignes(db, mois),
      creePar: acteurDe(user).nom,
      dateCreation: serverNowISO(),
      dateCalcul: serverNowISO(),
      valideePar: null,
      dateValidation: null,
      payeePar: null,
      datePaiement: null,
      modePaiement: null,
    };
    db.campagnesPaie.push(c);
    const t = totaux(c.lignes);
    journaliser(db, acteurDe(user), 'PREPARATION_PAIE', c.reference, null, `${t.effectif} salarié(s) • brut ${fcfa(t.brut)} • net ${fcfa(t.net)}`);
    return structuredClone(c);
  });
}

/** Recalcule une paie en préparation (pointages, congés, évolutions à jour), en conservant les éléments variables */
export function recalculerPaie(user: User, id: string): void {
  mutate((db) => {
    exiger(db, user, 'paie.gerer');
    const c = campagne(db, id);
    if (c.statut !== 'brouillon') throw new Error('Seule une paie en préparation peut être recalculée.');
    c.lignes = calculerLignes(db, c.mois, c.lignes);
    c.dateCalcul = serverNowISO();
    journaliser(db, acteurDe(user), 'MODIFICATION_PAIE', c.reference, null, 'Recalcul complet');
  });
}

export function ajouterElementVariable(user: User, id: string, employeId: string, el: Omit<ElementVariable, 'id'>): void {
  mutate((db) => {
    exiger(db, user, 'paie.gerer');
    const c = campagne(db, id);
    if (c.statut !== 'brouillon') throw new Error('La paie est verrouillée.');
    const ancienne = c.lignes.find((l) => l.employeId === employeId);
    if (!ancienne) throw new Error('Collaborateur absent de cette paie.');
    const elements = [...ancienne.elements, { ...el, id: uid('el') }];
    const nouvelle = calculerLignePaie(db, employe(db, employeId), c.mois, { todayKey: dateKey(serverNow()), elements });
    if (nouvelle) c.lignes = c.lignes.map((l) => (l.employeId === employeId ? nouvelle : l));
    journaliser(db, acteurDe(user), 'MODIFICATION_PAIE', c.reference, employeId, `${el.nature === 'prime' ? 'Prime' : 'Retenue'} « ${el.libelle} » ${fcfa(el.montant)}`);
  });
}

export function supprimerElementVariable(user: User, id: string, employeId: string, elementId: string): void {
  mutate((db) => {
    exiger(db, user, 'paie.gerer');
    const c = campagne(db, id);
    if (c.statut !== 'brouillon') throw new Error('La paie est verrouillée.');
    const ancienne = c.lignes.find((l) => l.employeId === employeId);
    const el = ancienne?.elements.find((x) => x.id === elementId);
    if (!ancienne || !el) return;
    const nouvelle = calculerLignePaie(db, employe(db, employeId), c.mois, { todayKey: dateKey(serverNow()), elements: ancienne.elements.filter((x) => x.id !== elementId) });
    if (nouvelle) c.lignes = c.lignes.map((l) => (l.employeId === employeId ? nouvelle : l));
    journaliser(db, acteurDe(user), 'MODIFICATION_PAIE', c.reference, employeId, `Suppression « ${el.libelle} »`);
  });
}

export function validerPaie(user: User, id: string): void {
  mutate((db) => {
    exiger(db, user, 'paie.gerer');
    const c = campagne(db, id);
    if (c.statut !== 'brouillon') throw new Error('Cette paie est déjà validée.');
    if (c.lignes.some((l) => l.net < 0)) throw new Error('Un net à payer est négatif : corrigez les retenues avant validation.');
    c.statut = 'validee';
    c.valideePar = acteurDe(user).nom;
    c.dateValidation = serverNowISO();
    const t = totaux(c.lignes);
    journaliser(db, acteurDe(user), 'VALIDATION_PAIE', c.reference, null, `Net total ${fcfa(t.net)} • coût employeur ${fcfa(t.coutEmployeur)}`);
  });
}

export function rouvrirPaie(user: User, id: string, motif: string): void {
  mutate((db) => {
    exiger(db, user, 'paie.gerer');
    const c = campagne(db, id);
    if (c.statut !== 'validee') throw new Error('Seule une paie validée et non versée peut être rouverte.');
    c.statut = 'brouillon';
    c.valideePar = null;
    c.dateValidation = null;
    journaliser(db, acteurDe(user), 'REOUVERTURE_PAIE', c.reference, null, motif);
  });
}

/**
 * Enregistre le versement des salaires : chaque collaborateur reçoit automatiquement
 * son bulletin de paie certifié dans son coffre-fort, avec une notification.
 */
export function payerSalaires(user: User, id: string, datePaiement: string, modePaiement: string): number {
  return mutate((db) => {
    exiger(db, user, 'paie.gerer');
    const c = campagne(db, id);
    if (c.statut !== 'validee') throw new Error('La paie doit être validée avant le versement.');
    const acteur = acteurDe(user);
    c.statut = 'payee';
    c.payeePar = acteur.nom;
    c.datePaiement = instant(datePaiement, heureHM(serverNow()));
    c.modePaiement = modePaiement;
    c.lignes.forEach((l) => {
      const emp = employe(db, l.employeId);
      creerDocument(db, emp, 'bulletin_paie', { mois: c.mois, campagneId: c.id, net: fcfa(l.net), datePaiement: `payé le ${dateCourte(datePaiement)}` }, { ...acteur, nom: 'Système (paie)' });
      // Dernière paie d'un collaborateur sorti : reçu pour solde de tout compte (non libératoire, CT art. 225)
      const sortie = db.sorties.find((x) => x.employeId === emp.id && x.statut !== 'annulee' && moisDe(x.dateSortie) === c.mois);
      if (sortie) {
        const recu = creerDocument(db, emp, 'solde_tout_compte', { sortieId: sortie.id, campagneId: c.id, mois: c.mois, net: fcfa(l.net) }, { ...acteur, nom: 'Système (paie)' });
        sortie.soldeId = recu.id;
      }
      notifier(db, {
        pour: { employeId: emp.id },
        titre: 'Bulletin de paie disponible',
        message: `${moisLong(c.mois)} • net versé ${fcfa(l.net)} le ${dateCourte(datePaiement)}`,
        lien: '/employe/documents',
        niveau: 'succes',
      });
    });
    const t = totaux(c.lignes);
    journaliser(db, acteur, 'PAIEMENT_SALAIRES', c.reference, null, `${t.effectif} bulletin(s) distribué(s) • net ${fcfa(t.net)} • ${modePaiement} du ${dateCourte(datePaiement)}`);
    return c.lignes.length;
  });
}
