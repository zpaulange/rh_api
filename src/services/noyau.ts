import { randomBytes } from 'node:crypto';
import type { Database } from '../types';

// Accès aux données pour les services métier : lecture de l'état courant et modification transactionnelle.
// Le moteur (services/moteur.ts) s'installe au démarrage : base chargée depuis MySQL, chaque modification
// appliquée sur une copie de travail puis persistée dans une transaction.

export interface MoteurDonnees {
  /** État courant (lecture seule) */
  lire(): Database;
  /** Applique une modification sur une copie de travail et renvoie le résultat de la recette */
  modifier<T>(recette: (db: Database) => T): T;
}

let moteur: MoteurDonnees | null = null;

export function installerMoteur(m: MoteurDonnees): void {
  moteur = m;
}

function actif(): MoteurDonnees {
  if (!moteur) throw new Error('Aucun moteur de données installé.');
  return moteur;
}

export const getDB = (): Database => actif().lire();

export function mutate<T = void>(recette: (db: Database) => T): T {
  return actif().modifier(recette);
}

/** Identifiant unique : préfixe métier, horodatage et aléa cryptographique */
export function uid(prefix: string): string {
  const alea = Array.from(randomBytes(6), (o) => o.toString(36).padStart(2, '0')).join('').slice(0, 10);
  return `${prefix}-${Date.now().toString(36)}${alea}`;
}
