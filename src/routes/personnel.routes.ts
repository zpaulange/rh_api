import * as comptes from '../controleurs/comptes.controleur';
import * as employes from '../controleurs/employes.controleur';
import * as organisation from '../controleurs/organisation.controleur';
import { exigerAdmin, exigerGestion } from '../middlewares/session';
import { routeur, valider } from '../middlewares/valider';
import { motif } from '../validateurs/communs';
import * as v from '../validateurs/personnel.validateur';

// Collaborateurs, comptes d'accès, permissions, organisation

export const routesProfil = routeur().put('/coordonnees', valider(v.coordonnees), employes.modifierCoordonnees);

export const routesEmployes = routeur()
  .use(exigerGestion)
  .post('/', valider(v.creationEmploye), employes.creer)
  .patch('/:id', valider(v.modificationEmploye), employes.modifier)
  .delete('/:id', valider(motif), employes.supprimer)
  .post('/:id/consultation-donnees-sensibles', employes.consulterDonneesSensibles)
  .post('/:id/evolutions', valider(v.evolution), employes.enregistrerEvolution)
  .post('/:id/sortie', valider(v.sortie), employes.enregistrerSortie);

export const routesSorties = routeur()
  .use(exigerGestion)
  .post('/:id/annulation', valider(motif), employes.annulerSortie);

export const routesComptes = routeur()
  .use(exigerGestion)
  .patch('/:employeId/acces', valider(v.acces), comptes.changerAcces)
  .post('/:employeId/deverrouillage', comptes.deverrouiller)
  .post('/:employeId/mot-de-passe', comptes.reinitialiserMotDePasse)
  .patch('/:employeId/role', exigerAdmin, valider(v.changementRole), comptes.changerRole);

export const routesPermissions = routeur().put('/:role', exigerAdmin, valider(v.permissions), comptes.modifierPermissions);

export const routesDepartements = routeur()
  .use(exigerGestion)
  .post('/', valider(v.departement), organisation.creerDepartement)
  .put('/:id', valider(v.departement), organisation.modifierDepartement)
  .delete('/:id', organisation.supprimerDepartement)
  .post('/:id/services', valider(v.service), organisation.ajouterService)
  .put('/:id/services/:serviceId', valider(v.service), organisation.modifierService)
  .delete('/:id/services/:serviceId', organisation.supprimerService);
