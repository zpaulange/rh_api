import { Router } from 'express';
import { authentifie } from '../middlewares/session';
import { routesAuth } from './auth.routes';
import { routesDemandesDocuments, routesDocuments } from './documents.routes';
import { routesPaies } from './paie.routes';
import { routesComptes, routesDepartements, routesEmployes, routesPermissions, routesProfil, routesSorties } from './personnel.routes';
import { routesPubliques, routesSysteme } from './systeme.routes';
import { routesAbsences, routesConges, routesPointages, routesRegularisations } from './temps.routes';

/**
 * API REST de SikaRH, montée sous /api.
 * Chaque route : session → rôle requis (RH / administrateur) → validation du corps → contrôleur.
 * Les droits fins (matrice des permissions) et les règles du Code du travail sont appliqués par les règles métier partagées.
 */
export const routesApi = Router();

routesApi.use(routesPubliques);
routesApi.use('/auth', routesAuth);

// Toutes les routes suivantes exigent une session valide
const protegees = Router();
protegees.use(authentifie);
protegees.use(routesSysteme);
protegees.use('/pointages', routesPointages);
protegees.use('/conges', routesConges);
protegees.use('/regularisations', routesRegularisations);
protegees.use('/absences', routesAbsences);
protegees.use('/demandes-documents', routesDemandesDocuments);
protegees.use('/documents', routesDocuments);
protegees.use('/profil', routesProfil);
protegees.use('/employes', routesEmployes);
protegees.use('/sorties', routesSorties);
protegees.use('/comptes', routesComptes);
protegees.use('/permissions', routesPermissions);
protegees.use('/departements', routesDepartements);
protegees.use('/paies', routesPaies);
routesApi.use(protegees);
