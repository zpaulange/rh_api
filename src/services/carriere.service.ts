import { LIBELLE_EVOLUTION } from '../referentiels/paie';
import { controleSmig, fcfa, situationActuelle } from '../metier/paie';
import { serverNow, serverNowISO } from '../metier/horloge';
import { dateCourte, dateKey, dateMoisLong, moisDe, moisLong } from '../metier/temps';
import type { Database, EvolutionCarriere, SituationContractuelle, TypeEvolution, User } from '../types';
import { getDB, mutate, uid } from './noyau';
import { SYSTEME, acteurDe, creerDocument, employe, exiger, journaliser, nomComplet, notifier, verifierRattachement } from './commun';

/* ================= Carrière ================= */

export interface NouvelleEvolution {
  type: Exclude<TypeEvolution, 'embauche'>;
  dateEffet: string;
  apres: SituationContractuelle;
  motif: string;
}

function appliquer(db: Database, ev: EvolutionCarriere) {
  const emp = employe(db, ev.employeId);
  // Une mutation vers un autre département détache le collaborateur de son service
  if (ev.apres.departement !== emp.departement) emp.service = '';
  Object.assign(emp, { ...ev.apres, primesFixes: ev.apres.primesFixes.map((p) => ({ ...p })) });
  ev.statut = 'appliquee';
}

/** Promotion, augmentation, mutation ou reclassement : historisé, avenant PDF généré, collaborateur notifié */
export function enregistrerEvolution(user: User, employeId: string, d: NouvelleEvolution): EvolutionCarriere {
  return mutate((db) => {
    exiger(db, user, 'collaborateurs.gerer');
    const emp = employe(db, employeId);
    const acteur = acteurDe(user);
    const today = dateKey(serverNow());
    if (d.dateEffet < emp.dateEmbauche) throw new Error("La date d'effet précède la date d'embauche.");
    // Une paie déjà versée ne peut pas être modifiée rétroactivement
    const payee = db.campagnesPaie.find((c) => c.statut === 'payee' && c.mois >= moisDe(d.dateEffet));
    if (payee) throw new Error(`La paie de ${moisLong(payee.mois)} est déjà versée : choisissez une date d'effet postérieure.`);
    if (db.evolutions.some((e) => e.employeId === employeId && e.statut === 'planifiee' && e.dateEffet === d.dateEffet))
      throw new Error('Une évolution est déjà planifiée à cette date pour ce collaborateur.');
    if (d.apres.salaireBase <= 0) throw new Error('Le salaire de base doit être positif.');
    const smig = controleSmig(d.apres.salaireBase, emp.heuresHebdo, emp.contrat);
    if (smig) throw new Error(smig);
    verifierRattachement(db, d.apres.departement, '');

    const ev: EvolutionCarriere = {
      id: uid('ev'),
      reference: `EV-${today.slice(0, 4)}-${String(db.evolutions.length + 1).padStart(4, '0')}`,
      employeId,
      type: d.type,
      dateEffet: d.dateEffet,
      avant: situationActuelle(emp),
      apres: d.apres,
      motif: d.motif,
      decidePar: acteur.nom,
      dateDecision: serverNowISO(),
      statut: 'planifiee',
      documentId: null,
    };
    db.evolutions.push(ev);
    if (d.dateEffet <= today) appliquer(db, ev);

    const doc = creerDocument(
      db,
      emp,
      'avenant',
      { evolutionId: ev.id, typeLibelle: LIBELLE_EVOLUTION[d.type], dateEffet: dateCourte(d.dateEffet), poste: d.apres.poste },
      acteur,
    );
    ev.documentId = doc.id;
    const avant = ev.avant!;
    const hausse = avant.salaireBase ? ((d.apres.salaireBase - avant.salaireBase) / avant.salaireBase) * 100 : 0;
    journaliser(
      db,
      acteur,
      'EVOLUTION_CARRIERE',
      `${nomComplet(emp)} — ${LIBELLE_EVOLUTION[d.type]}`,
      emp.id,
      `${avant.poste} → ${d.apres.poste} • ${fcfa(avant.salaireBase)} → ${fcfa(d.apres.salaireBase)}${hausse ? ` (${hausse > 0 ? '+' : ''}${hausse.toFixed(1)} %)` : ''} • effet ${dateCourte(d.dateEffet)}`,
    );
    notifier(db, {
      pour: { employeId: emp.id },
      titre: d.type === 'promotion' ? 'Félicitations pour votre promotion !' : `${LIBELLE_EVOLUTION[d.type]} enregistrée`,
      message: `${d.apres.poste} • à compter du ${dateMoisLong(d.dateEffet).replace(/^0/, '')}. Avenant disponible dans vos documents.`,
      lien: '/employe/documents',
      niveau: 'succes',
    });
    return { ...ev };
  });
}

/** Applique les évolutions planifiées dont la date d'effet est atteinte (exécuté à l'ouverture de l'application) */
export function appliquerEvolutionsEchues(): number {
  const today = dateKey(serverNow());
  const echues = getDB().evolutions.filter((e) => e.statut === 'planifiee' && e.dateEffet <= today);
  if (echues.length === 0) return 0;
  return mutate((db) => {
    db.evolutions
      .filter((e) => e.statut === 'planifiee' && e.dateEffet <= today)
      .sort((a, b) => a.dateEffet.localeCompare(b.dateEffet))
      .forEach((ev) => {
        appliquer(db, ev);
        const emp = employe(db, ev.employeId);
        journaliser(db, SYSTEME, 'APPLICATION_EVOLUTION', `${nomComplet(emp)} — ${LIBELLE_EVOLUTION[ev.type]}`, emp.id, `Effet au ${dateCourte(ev.dateEffet)} : ${ev.apres.poste}, ${fcfa(ev.apres.salaireBase)}`);
        notifier(db, {
          pour: { role: 'rh' },
          titre: 'Évolution appliquée',
          message: `${nomComplet(emp)} — ${ev.apres.poste} (${fcfa(ev.apres.salaireBase)})`,
          lien: `/rh/employes/${emp.id}`,
          niveau: 'info',
        });
      });
    return echues.length;
  });
}
