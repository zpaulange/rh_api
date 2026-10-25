import type { Request, Response } from 'express';
import * as paieService from '../services/paie.service';
import { executer } from '../services/commandes';

// Campagnes de paie : préparation → contrôle → validation → versement (bulletins distribués)

/** POST /api/paies */
export const preparer = (req: Request, res: Response) => executer(req, res, (user) => paieService.preparerPaie(user, req.body.mois), 201);

/** POST /api/paies/:id/recalcul */
export const recalculer = (req: Request, res: Response) => executer(req, res, (user) => paieService.recalculerPaie(user, req.params.id as string));

/** POST /api/paies/:id/elements — prime ou retenue exceptionnelle */
export const ajouterElement = (req: Request, res: Response) => executer(req, res, (user) => paieService.ajouterElementVariable(user, req.params.id as string, req.body.employeId, req.body.element), 201);

/** DELETE /api/paies/:id/elements/:employeId/:elementId */
export const supprimerElement = (req: Request, res: Response) =>
  executer(req, res, (user) => paieService.supprimerElementVariable(user, req.params.id as string, req.params.employeId as string, req.params.elementId as string));

/** POST /api/paies/:id/validation */
export const valider = (req: Request, res: Response) => executer(req, res, (user) => paieService.validerPaie(user, req.params.id as string));

/** POST /api/paies/:id/reouverture */
export const rouvrir = (req: Request, res: Response) => executer(req, res, (user) => paieService.rouvrirPaie(user, req.params.id as string, req.body.motif));

/** POST /api/paies/:id/versement */
export const verser = (req: Request, res: Response) => executer(req, res, (user) => paieService.payerSalaires(user, req.params.id as string, req.body.datePaiement, req.body.modePaiement));
