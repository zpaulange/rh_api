import { z } from 'zod';
import { LIBELLE_CONGE } from '../metier/regles';
import { date, enumDe, heure, id, motifPermission, texte } from './communs';

// Pointages, congés, régularisations, absences

/** Position envoyée par le navigateur : distance et zone sont recalculées par le serveur */
export const geo = z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180), precision: z.number().min(0).max(100_000) }).nullable();

export const arrivee = z.object({
  geo,
  photo: z
    .string()
    .max(3_000_000, 'Photo trop volumineuse')
    .regex(/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/, 'Format de photo invalide')
    .nullable(),
  // Le pointage biométrique provient des terminaux, jamais de l'API web
  source: z.enum(['web', 'mobile']),
});

export const depart = z.object({ geo });

export const demandeConge = z.object({
  type: enumDe(LIBELLE_CONGE),
  motifPermission: motifPermission.optional(),
  dateAccouchementPresumee: date.optional(),
  debut: date,
  debutPeriode: z.enum(['matin', 'midi']),
  fin: date,
  finPeriode: z.enum(['midi', 'fin']),
  motif: texte(300),
  justificatif: texte(191).nullable(),
});

export const decision = z.object({ approuver: z.boolean(), commentaire: texte(500) });
export const accouchement = z.object({ date });
export const prolongation = z.object({ justificatif: texte(191) });

export const regularisation = z.object({ type: z.enum(['oubli', 'retard', 'mission']), date, entree: heure, depart: heure, motif: texte(300).min(1), justificatif: texte(191).nullable() });

export const justification = z.object({
  employeId: id,
  debut: date,
  fin: date,
  justification: z.object({ type: enumDe(LIBELLE_CONGE).exclude(['rtt']), motifPermission: motifPermission.optional(), motif: texte(300), justificatif: texte(191).nullable() }),
});

export const relance = z.object({ employeId: id, jours: z.array(date).min(1).max(62) });
