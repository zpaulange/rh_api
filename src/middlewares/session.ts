import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { moteur } from '../services/moteur';
import { utilisateurDe } from '../services/session';
import type { User } from '../types';

// Session : jeton signé (JWT) dans un cookie httpOnly, inaccessible au JavaScript de la page.
// Le rôle et l'état du compte sont relus dans la base à chaque requête : une désactivation ou un changement
// de rôle s'appliquent immédiatement.

export const COOKIE = 'sikarh_session';

declare module 'express-serve-static-core' {
  interface Request {
    utilisateur?: User;
  }
}

interface Jeton {
  sub: string;
  persistante: boolean;
}

export function lireCookie(req: Request, nom: string): string | null {
  const entete = req.headers.cookie;
  if (!entete) return null;
  for (const partie of entete.split(';')) {
    const [cle, ...valeur] = partie.trim().split('=');
    if (cle === nom) return decodeURIComponent(valeur.join('='));
  }
  return null;
}

export function ouvrirSession(res: Response, compteId: string, persistante: boolean): void {
  const duree = persistante ? config.SESSION_PERSISTANTE_JOURS * 86_400 : 12 * 3600;
  const jeton = jwt.sign({ sub: compteId, persistante } satisfies Jeton, config.JWT_SECRET, { expiresIn: duree });
  res.cookie(COOKIE, jeton, {
    httpOnly: true,
    sameSite: 'strict',
    secure: config.COOKIE_SECURISE,
    path: '/api',
    // Session de navigateur, sauf « Se souvenir de moi »
    ...(persistante ? { maxAge: duree * 1000 } : {}),
  });
}

export function fermerSession(res: Response): void {
  res.clearCookie(COOKIE, { httpOnly: true, sameSite: 'strict', secure: config.COOKIE_SECURISE, path: '/api' });
}

/** Utilisateur de la requête, ou null (jeton absent, expiré, falsifié, compte désactivé) */
export function utilisateurRequete(req: Request): User | null {
  const jeton = lireCookie(req, COOKIE);
  if (!jeton) return null;
  try {
    const contenu = jwt.verify(jeton, config.JWT_SECRET) as Jeton;
    return utilisateurDe(moteur().lire(), contenu.sub);
  } catch {
    return null;
  }
}

/** Exige une session valide */
export function authentifie(req: Request, res: Response, next: NextFunction): void {
  const user = utilisateurRequete(req);
  if (!user) {
    fermerSession(res);
    res.status(401).json({ erreur: 'Session expirée ou invalide : reconnectez-vous.' });
    return;
  }
  req.utilisateur = user;
  next();
}

/** Protection CSRF : toute requête de modification doit porter l'en-tête applicatif (impossible depuis un formulaire tiers) */
export function antiCsrf(req: Request, res: Response, next: NextFunction): void {
  if (req.method !== 'GET' && req.method !== 'HEAD' && req.headers['x-sikarh'] !== '1') {
    res.status(403).json({ erreur: 'Requête refusée (en-tête de sécurité manquant).' });
    return;
  }
  next();
}

/** Réservé au service RH et à l'administration (les droits fins sont vérifiés par chaque règle métier) */
export function exigerGestion(req: Request, res: Response, next: NextFunction): void {
  const role = req.utilisateur?.role;
  if (role !== 'rh' && role !== 'admin') {
    res.status(403).json({ erreur: 'Action réservée au service RH et à l’administration.' });
    return;
  }
  next();
}

/** Réservé à l'administrateur */
export function exigerAdmin(req: Request, res: Response, next: NextFunction): void {
  if (req.utilisateur?.role !== 'admin') {
    res.status(403).json({ erreur: 'Action réservée à l’administrateur.' });
    return;
  }
  next();
}
