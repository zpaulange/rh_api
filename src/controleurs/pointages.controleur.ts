import type { Request, Response } from 'express';
import { versGeoPoint, type PositionRecue } from '../metier/geo';
import type { GeoPoint } from '../types';
import * as pointagesService from '../services/pointages.service';
import { executer, lire } from '../services/commandes';
import { ErreurIntrouvable, ErreurValidation } from '../services/erreurs';
import { photoAccessible } from '../services/vues';

// Pointage en libre-service (arrivée, pause, départ) et photos de pointage

/** Distance au site et appartenance à la zone recalculées par le serveur (jamais reçues du navigateur) */
function positionServeur(geo: PositionRecue | null): GeoPoint | null {
  return geo ? versGeoPoint(geo, lire().parametres.site) : null;
}

/** POST /api/pointages/arrivee */
export const pointerArrivee = (req: Request, res: Response) =>
  executer(
    req,
    res,
    (user) => {
      const p = lire().parametres;
      if (p.geolocObligatoire && !req.body.geo) throw new ErreurValidation('La géolocalisation est obligatoire pour pointer.');
      if (p.photoObligatoire && !req.body.photo) throw new ErreurValidation('La photo est obligatoire pour pointer.');
      return pointagesService.pointerArrivee(user, { geo: positionServeur(req.body.geo), photo: req.body.photo, source: req.body.source });
    },
    201,
  );

/** POST /api/pointages/pause (début ou reprise) */
export const basculerPause = (req: Request, res: Response) => executer(req, res, (user) => pointagesService.basculerPause(user));

/** POST /api/pointages/depart */
export const pointerDepart = (req: Request, res: Response) => executer(req, res, (user) => pointagesService.pointerDepart(user, positionServeur(req.body.geo)));

/** GET /api/pointages/:id/photo — le collaborateur concerné ou la gestion des présences */
export function photo(req: Request, res: Response): void {
  const db = lire();
  const p = db.pointages.find((x) => x.id === req.params.id);
  if (!p || !p.photo || !photoAccessible(db, req.utilisateur!, p)) throw new ErreurIntrouvable('Photo introuvable.');
  const m = /^data:(image\/[a-z]+);base64,(.+)$/.exec(p.photo);
  if (!m) throw new ErreurIntrouvable('Photo illisible.');
  res.set('Content-Type', m[1]).set('Cache-Control', 'private, max-age=86400').send(Buffer.from(m[2], 'base64'));
}
