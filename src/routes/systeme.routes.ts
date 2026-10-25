import * as admin from '../controleurs/administration.controleur';
import { exigerAdmin, exigerGestion } from '../middlewares/session';
import { routeur, valider } from '../middlewares/valider';
import { exportJournal, lectureNotifications, parametres } from '../validateurs/paie.validateur';

/** Routes publiques (sans session) */
export const routesPubliques = routeur()
  .all('/horloge', admin.horloge)
  .get('/sante', admin.sante);

/** Données, temps réel, paramètres, notifications, exports, démonstration */
export const routesSysteme = routeur()
  .get('/etat', admin.etat)
  .get('/evenements', admin.evenements)
  .put('/parametres', exigerGestion, valider(parametres), admin.modifierParametres)
  .post('/notifications/lues', valider(lectureNotifications), admin.marquerLues)
  .post('/exports/journal', exigerGestion, valider(exportJournal), admin.journaliserExport)
  .post('/demo/reinitialiser', exigerAdmin, admin.reinitialiserDemo);

