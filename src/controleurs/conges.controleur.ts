import type { Request, Response } from 'express';
import * as congesService from '../services/conges.service';
import { executer } from '../services/commandes';

// Congés, permissions, maternité

/** POST /api/conges — demande du collaborateur connecté */
export const demander = (req: Request, res: Response) => executer(req, res, (user) => congesService.demanderConge(user, req.body), 201);

/** POST /api/conges/:id/decision — validation ou refus (droit « Valider les congés » ou « les permissions ») */
export const decider = (req: Request, res: Response) => executer(req, res, (user) => congesService.deciderConge(user, req.params.id as string, req.body.approuver, req.body.commentaire));

/** POST /api/conges/:id/accouchement — date réelle, fin du congé de maternité ajustée (CT art. 170) */
export const declarerAccouchement = (req: Request, res: Response) => executer(req, res, (user) => congesService.declarerAccouchement(user, req.params.id as string, req.body.date));

/** POST /api/conges/:id/prolongation — 4 semaines pour maladie (CT art. 170) */
export const prolongerMaternite = (req: Request, res: Response) => executer(req, res, (user) => congesService.prolongerMaternite(user, req.params.id as string, req.body.justificatif));
