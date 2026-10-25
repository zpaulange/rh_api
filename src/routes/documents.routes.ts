import * as documents from '../controleurs/documents.controleur';
import { exigerGestion } from '../middlewares/session';
import { routeur, valider } from '../middlewares/valider';
import { motif } from '../validateurs/communs';
import * as v from '../validateurs/documents.validateur';

export const routesDemandesDocuments = routeur()
  .post('/', valider(v.demandeDocument), documents.demander)
  .post('/:id/traitement', exigerGestion, documents.traiter)
  .post('/:id/refus', exigerGestion, valider(motif), documents.refuser);

export const routesDocuments = routeur()
  .post('/', exigerGestion, valider(v.generation), documents.generer)
  .post('/verification', valider(v.verification), documents.verifier)
  .post('/:id/telechargement', documents.telechargement);
