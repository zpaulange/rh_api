import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { config } from '../config';
import * as auth from '../controleurs/auth.controleur';
import { authentifie } from '../middlewares/session';
import { routeur, valider } from '../middlewares/valider';

// En plus du verrouillage du compte après échecs répétés (règle métier), limite les échecs par adresse IP
// (les connexions réussies ne comptent pas : plusieurs collaborateurs partagent souvent la même IP)
const limiteConnexion = rateLimit({
  windowMs: 15 * 60_000,
  limit: config.LIMITE_ECHECS_CONNEXION,
  skipSuccessfulRequests: true,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { erreur: 'Trop de tentatives depuis ce poste. Réessayez dans quelques minutes.' },
});

const identifiants = z.object({ email: z.string().max(191), motDePasse: z.string().max(200), persistante: z.boolean().default(false) });

export const routesAuth = routeur()
  .post('/connexion', limiteConnexion, valider(identifiants), auth.connexion)
  .get('/session', auth.session)
  .post('/deconnexion', authentifie, auth.deconnexion);
