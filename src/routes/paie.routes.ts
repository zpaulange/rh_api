import * as paie from '../controleurs/paie.controleur';
import { exigerGestion } from '../middlewares/session';
import { routeur, valider } from '../middlewares/valider';
import { motif } from '../validateurs/communs';
import * as v from '../validateurs/paie.validateur';

export const routesPaies = routeur()
  .use(exigerGestion)
  .post('/', valider(v.campagne), paie.preparer)
  .post('/:id/recalcul', paie.recalculer)
  .post('/:id/elements', valider(v.elementVariable), paie.ajouterElement)
  .delete('/:id/elements/:employeId/:elementId', paie.supprimerElement)
  .post('/:id/validation', paie.valider)
  .post('/:id/reouverture', valider(motif), paie.rouvrir)
  .post('/:id/versement', valider(v.versement), paie.verser);
