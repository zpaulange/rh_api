import type { NextFunction, Request, Response } from 'express';
import { BaseError } from 'sequelize';
import { ErreurAcces, ErreurIntrouvable, ErreurValidation } from '../services/erreurs';

// Erreurs : les règles métier (Code du travail, droits, soldes…) renvoient leur message à l'utilisateur ;
// les erreurs techniques sont journalisées et masquées.
export function gestionErreurs(err: unknown, req: Request, res: Response, next: NextFunction): void {
  void next;
  if (err instanceof ErreurValidation) {
    res.status(400).json({ erreur: err.message });
    return;
  }
  if (err instanceof ErreurIntrouvable) {
    res.status(404).json({ erreur: err.message });
    return;
  }
  if (err instanceof ErreurAcces) {
    res.status(403).json({ erreur: err.message });
    return;
  }
  if ((err as { type?: string })?.type === 'entity.too.large') {
    res.status(413).json({ erreur: 'Données trop volumineuses.' });
    return;
  }
  if ((err as { type?: string })?.type === 'entity.parse.failed') {
    res.status(400).json({ erreur: 'Corps de requête invalide.' });
    return;
  }
  const technique = err instanceof BaseError || err instanceof TypeError || err instanceof ReferenceError || err instanceof RangeError || !(err instanceof Error);
  if (technique) {
    console.error(`[erreur] ${req.method} ${req.originalUrl}`, err);
    res.status(500).json({ erreur: 'Erreur interne du serveur. L’opération n’a pas été enregistrée.' });
    return;
  }
  res.status(422).json({ erreur: (err as Error).message });
}
