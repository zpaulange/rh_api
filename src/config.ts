import 'dotenv/config';
import { z } from 'zod';

// Configuration validée au démarrage : le serveur refuse de démarrer avec une configuration incomplète
const schema = z.object({
  PORT: z.coerce.number().int().positive().default(4000),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  CORS_ORIGINE: z.string().default('http://localhost:5173'),
  DB_HOTE: z.string().min(1),
  DB_PORT: z.coerce.number().int().positive().default(3306),
  DB_NOM: z.string().min(1),
  DB_UTILISATEUR: z.string().min(1),
  DB_MOT_DE_PASSE: z.string(),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET doit comporter au moins 32 caractères'),
  SESSION_PERSISTANTE_JOURS: z.coerce.number().int().positive().default(30),
  /** Échecs de connexion tolérés par adresse IP sur 15 minutes (en plus du verrouillage de chaque compte) */
  LIMITE_ECHECS_CONNEXION: z.coerce.number().int().positive().default(30),
  COOKIE_SECURISE: z.enum(['true', 'false']).default('false').transform((v) => v === 'true'),
  DEMO: z.enum(['true', 'false']).default('false').transform((v) => v === 'true'),
});

const resultat = schema.safeParse(process.env);
if (!resultat.success) {
  console.error('Configuration invalide :', resultat.error.issues.map((i) => `${i.path.join('.')} : ${i.message}`).join(' ; '));
  process.exit(1);
}

export const config = resultat.data;
export const production = config.NODE_ENV === 'production';
