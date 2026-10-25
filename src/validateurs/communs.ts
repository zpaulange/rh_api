import { z } from 'zod';
import { MOTIFS_PERMISSION } from '../referentiels/paie';
import type { MotifPermission } from '../types';

// Types élémentaires des entrées de l'API

export const enumDe = <T extends Record<string, unknown>>(o: T) => z.enum(Object.keys(o) as [Extract<keyof T, string>, ...Extract<keyof T, string>[]]);
export const id = z.string().regex(/^[A-Za-z0-9_-]{1,40}$/, 'Identifiant invalide');
export const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date attendue au format AAAA-MM-JJ');
export const mois = z.string().regex(/^\d{4}-\d{2}$/, 'Mois attendu au format AAAA-MM');
export const heure = z.string().regex(/^\d{2}:\d{2}$/, 'Heure attendue au format HH:MM');
export const texte = (max = 500) => z.string().max(max);
export const montant = z.number().finite().min(0).max(1e12);
export const role = z.enum(['employe', 'rh', 'admin']);
export const motifPermission = z.enum(Object.keys(MOTIFS_PERMISSION) as [MotifPermission, ...MotifPermission[]]);
export const primeFixe = z.object({ libelle: texte(120), montant, soumisCnss: z.boolean(), soumisIts: z.boolean(), remboursementFrais: z.boolean() });

/** Corps réduit à un motif (refus, annulation, réouverture, suppression…) */
export const motif = z.object({ motif: texte(500) });
