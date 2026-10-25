import type { Request, Response } from 'express';
import { config } from '../config';
import { fermerSession, ouvrirSession, utilisateurRequete } from '../middlewares/session';
import * as authService from '../services/auth.service';
import { moteur, verifierMotDePasse } from '../services/moteur';
import { utilisateurDe } from '../services/session';
import { vuePour } from '../services/vues';

// Connexion, reprise de session, déconnexion

const reponseSession = (compteId: string) => {
  const db = moteur().lire();
  return { compteId, etat: vuePour(db, utilisateurDe(db, compteId)!), serveur: { demo: config.DEMO } };
};

/** POST /api/auth/connexion — règles de la connexion partagées (verrouillage, compte désactivé, journal) */
export async function connexion(req: Request, res: Response): Promise<void> {
  const { email, motDePasse, persistante } = req.body as { email: string; motDePasse: string; persistante: boolean };
  const resultat = await moteur().executer(() => authService.authentifier(email, motDePasse, { verifier: verifierMotDePasse, agent: req.get('user-agent') ?? 'inconnu' }));
  if (!resultat.ok) {
    res.status(401).json({ erreur: resultat.erreur });
    return;
  }
  ouvrirSession(res, resultat.compte.id, persistante);
  res.json(reponseSession(resultat.compte.id));
}

/** GET /api/auth/session — reprise de session au chargement de l'application */
export function session(req: Request, res: Response): void {
  const user = utilisateurRequete(req);
  if (!user) {
    fermerSession(res);
    res.status(401).json({ erreur: 'Aucune session.' });
    return;
  }
  res.json(reponseSession(user.compteId));
}

/** POST /api/auth/deconnexion */
export async function deconnexion(req: Request, res: Response): Promise<void> {
  await moteur().executer(() => authService.journaliserDeconnexion(req.utilisateur!, req.body?.expiree === true));
  fermerSession(res);
  res.json({ ok: true });
}
