import type { Request, Response } from 'express';
import * as absencesService from '../services/absences.service';
import { executer } from '../services/commandes';

/** POST /api/absences/justification — absence non justifiée transformée en absence autorisée */
export const justifier = (req: Request, res: Response) =>
  executer(req, res, (user) => absencesService.justifierAbsence(user, req.body.employeId, req.body.debut, req.body.fin, req.body.justification), 201);

/** POST /api/absences/relance — demande de justificatif au collaborateur */
export const relancer = (req: Request, res: Response) => executer(req, res, (user) => absencesService.relancerAbsence(user, req.body.employeId, req.body.jours));
