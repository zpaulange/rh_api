import * as absences from '../controleurs/absences.controleur';
import * as conges from '../controleurs/conges.controleur';
import * as pointages from '../controleurs/pointages.controleur';
import * as regularisations from '../controleurs/regularisations.controleur';
import { exigerGestion } from '../middlewares/session';
import { routeur, valider } from '../middlewares/valider';
import * as v from '../validateurs/temps.validateur';

// Temps de travail : pointages, congés et permissions, régularisations, absences

export const routesPointages = routeur()
  .post('/arrivee', valider(v.arrivee), pointages.pointerArrivee)
  .post('/pause', pointages.basculerPause)
  .post('/depart', valider(v.depart), pointages.pointerDepart)
  .get('/:id/photo', pointages.photo);

export const routesConges = routeur()
  .post('/', valider(v.demandeConge), conges.demander)
  .post('/:id/decision', exigerGestion, valider(v.decision), conges.decider)
  .post('/:id/accouchement', exigerGestion, valider(v.accouchement), conges.declarerAccouchement)
  .post('/:id/prolongation', exigerGestion, valider(v.prolongation), conges.prolongerMaternite);

export const routesRegularisations = routeur()
  .post('/', valider(v.regularisation), regularisations.demander)
  .post('/:id/decision', exigerGestion, valider(v.decision), regularisations.decider);

export const routesAbsences = routeur()
  .use(exigerGestion)
  .post('/justification', valider(v.justification), absences.justifier)
  .post('/relance', valider(v.relance), absences.relancer);
