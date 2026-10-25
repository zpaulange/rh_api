import { z } from 'zod';
import { date, heure, montant, mois, texte } from './communs';

export const campagne = z.object({ mois });
export const elementVariable = z.object({
  employeId: z.string().regex(/^[A-Za-z0-9_-]{1,40}$/),
  element: z.object({ libelle: texte(120).min(1), montant, nature: z.enum(['prime', 'retenue']), soumisCnss: z.boolean(), soumisIts: z.boolean() }),
});
export const versement = z.object({ datePaiement: date, modePaiement: texte(120) });

export const parametres = z.object({
  heureDebut: heure,
  heureFin: heure,
  toleranceRetard: z.number().min(0).max(240),
  heuresJour: z.number().min(1).max(12),
  site: z.object({ nom: texte(120), lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180), rayon: z.number().min(10).max(50_000) }),
  geolocObligatoire: z.boolean(),
  photoObligatoire: z.boolean(),
  cpParMois: z.number().min(2).max(5),
  quotaPermissions: z.number().min(0).max(10),
  anticipationConges: z.boolean(),
  dateRepriseSoldes: date,
  dateDebutPointage: date,
  sessionMinutes: z.number().int().min(5).max(1440),
  tentativesMax: z.number().int().min(1).max(20),
  verrouillageMinutes: z.number().int().min(1).max(1440),
  joursFeries: z.array(z.object({ date, libelle: texte(120).min(1), estime: z.boolean() })).max(200),
});

export const exportJournal = z.object({ rapport: texte(300), format: z.enum(['CSV', 'PDF']), lignes: z.number().int().min(0) });
export const lectureNotifications = z.object({ ids: z.array(z.string().max(40)).max(500) });
