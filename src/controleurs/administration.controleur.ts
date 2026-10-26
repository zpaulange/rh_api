import type { Request, Response } from 'express';
import { config } from '../config';
import { ecrireBaseComplete } from '../db/depot';
import { creerBaseInitiale } from '../db/donnees/demonstration';
import * as parametresService from '../services/parametres.service';
import * as notificationsService from '../services/notifications.service';
import { executer, lire } from '../services/commandes';
import { moteur, securiserMotsDePasse } from '../services/moteur';
import { vuePour } from '../services/vues';

// Données, paramètres, notifications, exports, horloge, état de santé, démonstration

/** GET /api/etat — données visibles par l'utilisateur connecté (ETag par révision) */
export function etat(req: Request, res: Response): void {
  const db = lire();
  const user = req.utilisateur!;
  const etiquette = `"${db.version}-${user.compteId}-${user.role}"`;
  if (req.headers['if-none-match'] === etiquette) {
    res.status(304).end();
    return;
  }
  res.set('ETag', etiquette).set('Cache-Control', 'no-cache').json(vuePour(db, user));
}

/** GET /api/evenements — révisions de la base en temps réel (Server-Sent Events) */
export function evenements(req: Request, res: Response): void {
  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
  res.write(`retry: 3000\nevent: revision\ndata: ${moteur().revision}\n\n`);
  const envoyer = (revision: number) => res.write(`event: revision\ndata: ${revision}\n\n`);
  const battement = setInterval(() => res.write(': battement\n\n'), 25_000);
  moteur().evenements.on('revision', envoyer);
  req.on('close', () => {
    clearInterval(battement);
    moteur().evenements.off('revision', envoyer);
  });
}

/** PUT /api/parametres */
export const modifierParametres = (req: Request, res: Response) => executer(req, res, (user) => parametresService.modifierParametres(user, req.body));

/** POST /api/notifications/lues — uniquement ses propres notifications */
export const marquerLues = (req: Request, res: Response) =>
  executer(req, res, (user) => {
    const miennes = new Set(notificationsService.notificationsPour(lire(), user).map((n) => n.id));
    return notificationsService.marquerLues((req.body.ids as string[]).filter((id) => miennes.has(id)));
  });

/** POST /api/exports/journal — trace d'un export (CSV, PDF) */
export const journaliserExport = (req: Request, res: Response) => executer(req, res, (user) => parametresService.journaliserExport(user, req.body.rapport, req.body.format, req.body.lignes));

/** HEAD|GET /api/horloge — heure du serveur (en-tête Date) pour l'affichage */
export function horloge(_req: Request, res: Response): void {
  res.set('Cache-Control', 'no-store').status(204).end();
}

/** GET /api/sante */
export function sante(_req: Request, res: Response): void {
  res.json({ ok: true, revision: moteur().revision });
}

/** POST /api/demo/reinitialiser — administrateur, serveur en mode démonstration uniquement */
export async function reinitialiserDemo(_req: Request, res: Response): Promise<void> {
  if (!config.DEMO) {
    res.status(403).json({ erreur: 'Réinitialisation non autorisée (serveur hors mode démonstration).' });
    return;
  }
  const base = creerBaseInitiale();
  securiserMotsDePasse(base);
  await moteur().remplacer(base, ecrireBaseComplete);
  res.json({ ok: true });
}
