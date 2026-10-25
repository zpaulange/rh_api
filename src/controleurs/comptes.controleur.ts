import type { Request, Response } from 'express';
import type { Permission, Role } from '../types';
import * as employesService from '../services/employes.service';
import * as permissionsService from '../services/permissions.service';
import { executer } from '../services/commandes';

// Comptes d'accès (identifiés par le dossier du collaborateur), rôles et matrice des permissions

/** PATCH /api/comptes/:employeId/acces */
export const changerAcces = (req: Request, res: Response) => executer(req, res, (user) => employesService.changerAcces(user, req.params.employeId as string, req.body.actif));

/** POST /api/comptes/:employeId/deverrouillage */
export const deverrouiller = (req: Request, res: Response) => executer(req, res, (user) => employesService.deverrouillerCompte(user, req.params.employeId as string));

/** POST /api/comptes/:employeId/mot-de-passe — mot de passe temporaire renvoyé une seule fois */
export const reinitialiserMotDePasse = (req: Request, res: Response) => executer(req, res, (user) => employesService.reinitialiserMotDePasse(user, req.params.employeId as string));

/** PATCH /api/comptes/:employeId/role — administrateur uniquement */
export const changerRole = (req: Request, res: Response) => executer(req, res, (user) => permissionsService.changerRole(user, req.params.employeId as string, req.body.role, req.body.motif));

/** PUT /api/permissions/:role — administrateur uniquement */
export const modifierPermissions = (req: Request, res: Response) => executer(req, res, (user) => permissionsService.modifierPermissions(user, req.params.role as Role, req.body.permissions as Permission[]));
