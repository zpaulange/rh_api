import type { Request, Response } from 'express';
import * as regularisationsService from '../services/regularisations.service';
import { executer } from '../services/commandes';

/** POST /api/regularisations — demande du collaborateur connecté */
export const demander = (req: Request, res: Response) => executer(req, res, (user) => regularisationsService.demanderRegularisation(user, req.body), 201);

/** POST /api/regularisations/:id/decision */
export const decider = (req: Request, res: Response) => executer(req, res, (user) => regularisationsService.deciderRegularisation(user, req.params.id as string, req.body.approuver, req.body.commentaire));
