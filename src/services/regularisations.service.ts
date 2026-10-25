import { calculerRetard } from '../metier/regles';
import { serverNow, serverNowISO } from '../metier/horloge';
import { dateCourte, dateKey, instant } from '../metier/temps';
import type { Regularisation, User } from '../types';
import { mutate, uid } from './noyau';
import { acteurDe, annee, employe, exiger, journaliser, nomComplet, notifier } from './commun';
import { TERMINAUX } from './pointages.service';

/* ================= Régularisations ================= */

export type NouvelleRegularisation = Pick<Regularisation, 'type' | 'date' | 'entree' | 'depart' | 'motif' | 'justificatif'>;

export function demanderRegularisation(user: User, d: NouvelleRegularisation): Regularisation {
  return mutate((db) => {
    const emp = employe(db, user.employeId);
    if (d.date > dateKey(serverNow())) throw new Error('Impossible de régulariser une date future.');
    if (d.depart <= d.entree) throw new Error("L'heure de départ doit être postérieure à l'heure d'entrée.");
    const r: Regularisation = {
      id: uid('rg'),
      reference: `REG-${annee()}-${String(2500 + db.regularisations.length).padStart(4, '0')}`,
      employeId: emp.id,
      ...d,
      statut: 'en_attente',
      dateDemande: serverNowISO(),
      traitePar: null,
      dateTraitement: null,
      commentaireRH: '',
    };
    db.regularisations.push(r);
    journaliser(db, acteurDe(user), 'DEMANDE_REGULARISATION', r.reference, emp.id, `${dateCourte(r.date)} • ${r.entree}-${r.depart} • ${r.motif}`);
    notifier(db, {
      pour: { role: 'rh' },
      titre: 'Régularisation à traiter',
      message: `${nomComplet(emp)} — ${dateCourte(r.date)}`,
      lien: '/rh/pointages',
      niveau: 'info',
    });
    return { ...r };
  });
}

export function deciderRegularisation(user: User, id: string, approuve: boolean, commentaire: string): void {
  mutate((db) => {
    exiger(db, user, 'presences.gerer');
    const r = db.regularisations.find((x) => x.id === id);
    if (!r || r.statut !== 'en_attente') throw new Error('Demande déjà traitée.');
    const acteur = acteurDe(user);
    const emp = employe(db, r.employeId);
    r.statut = approuve ? 'approuve' : 'refuse';
    r.traitePar = acteur.nom;
    r.dateTraitement = serverNowISO();
    r.commentaireRH = commentaire;

    if (approuve) {
      const arrivee = instant(r.date, r.entree);
      const depart = instant(r.date, r.depart);
      const p = db.pointages.find((x) => x.employeId === r.employeId && x.date === r.date);
      if (!p) {
        db.pointages.push({
          id: uid('pt'),
          employeId: r.employeId,
          date: r.date,
          arrivee,
          depart,
          pauseMinutes: 60,
          pauseDebut: null,
          source: 'regularisation',
          terminal: TERMINAUX.regularisation,
          retardMinutes: calculerRetard(arrivee, db.parametres),
          geo: null,
          geoDepart: null,
          photo: null,
          horodatage: 'serveur',
        });
      } else if (r.type === 'oubli') {
        p.arrivee = arrivee;
        p.depart = depart;
        p.pauseDebut = null;
        p.retardMinutes = calculerRetard(arrivee, db.parametres);
        p.terminal = TERMINAUX.regularisation;
      }
    }
    journaliser(db, acteur, approuve ? 'VALIDATION_REGULARISATION' : 'REFUS_REGULARISATION', r.reference, emp.id, commentaire || `${dateCourte(r.date)} • ${r.entree}-${r.depart}`);
    notifier(db, {
      pour: { employeId: emp.id },
      titre: approuve ? 'Régularisation validée' : 'Régularisation refusée',
      message: approuve ? `Pointage du ${dateCourte(r.date)} mis à jour` : commentaire || `Pointage du ${dateCourte(r.date)}`,
      lien: '/employe/pointages',
      niveau: approuve ? 'succes' : 'alerte',
    });
  });
}
