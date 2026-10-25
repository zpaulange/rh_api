import type { Request, Response } from 'express';
import type { User } from '../types';
import { moteur } from './moteur';
import { vuePour } from './vues';

/**
 * Exécute une commande métier pour l'utilisateur de la session et répond avec son résultat
 * et les données à jour visibles par cet utilisateur (le navigateur met son cache à jour).
 * La commande est exclusive et atomique (voir services/moteur.ts).
 */
export async function executer<T>(req: Request, res: Response, commande: (user: User) => T, statut = 200): Promise<void> {
  const user = req.utilisateur!;
  const resultat = await moteur().executer(() => commande(user));
  res.status(statut).json({ resultat: resultat === undefined ? null : resultat, etat: vuePour(moteur().lire(), user) });
}

/** Lecture (sans modification) des données courantes */
export const lire = () => moteur().lire();
