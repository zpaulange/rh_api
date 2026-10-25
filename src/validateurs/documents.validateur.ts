import { z } from 'zod';
import { LIBELLE_DEMANDE_DOCUMENT, LIBELLE_MODELE } from '../metier/documents';
import { enumDe, id, mois, texte } from './communs';

export const demandeDocument = z.object({ type: enumDe(LIBELLE_DEMANDE_DOCUMENT), destinataire: texte(191), format: z.enum(['digital', 'paper']), commentaire: texte(300), mois: mois.optional() });
export const generation = z.object({ employeId: id, modele: enumDe(LIBELLE_MODELE), params: z.record(z.string().max(64), z.string().max(500)) });
export const verification = z.object({ code: texte(64).min(1) });
