import type { Request, Response } from 'express';
import * as organisationService from '../services/organisation.service';
import { executer } from '../services/commandes';

// Départements et services

/** POST /api/departements */
export const creerDepartement = (req: Request, res: Response) => executer(req, res, (user) => organisationService.creerDepartement(user, req.body), 201);

/** PUT /api/departements/:id */
export const modifierDepartement = (req: Request, res: Response) => executer(req, res, (user) => organisationService.modifierDepartement(user, req.params.id as string, req.body));

/** DELETE /api/departements/:id */
export const supprimerDepartement = (req: Request, res: Response) => executer(req, res, (user) => organisationService.supprimerDepartement(user, req.params.id as string));

/** POST /api/departements/:id/services */
export const ajouterService = (req: Request, res: Response) => executer(req, res, (user) => organisationService.ajouterService(user, req.params.id as string, req.body), 201);

/** PUT /api/departements/:id/services/:serviceId */
export const modifierService = (req: Request, res: Response) => executer(req, res, (user) => organisationService.modifierService(user, req.params.id as string, req.params.serviceId as string, req.body));

/** DELETE /api/departements/:id/services/:serviceId */
export const supprimerService = (req: Request, res: Response) => executer(req, res, (user) => organisationService.supprimerService(user, req.params.id as string, req.params.serviceId as string));
