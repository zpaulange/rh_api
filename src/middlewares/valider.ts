import { Router, type NextFunction, type Request, type Response } from 'express';
import { z } from 'zod';

// Messages de validation en français
z.config(z.locales.fr());

/**
 * Valide le corps de la requête : seuls les champs déclarés par le schéma sont conservés
 * (un champ inattendu ne peut pas atteindre une règle métier qui recopie l'objet reçu).
 */
export function valider(schema: z.ZodTypeAny) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const resultat = schema.safeParse(req.body ?? {});
    if (!resultat.success) {
      res.status(400).json({ erreur: `Données invalides : ${resultat.error.issues.map((i) => `${i.path.join('.') || 'corps'} — ${i.message}`).join(' ; ')}` });
      return;
    }
    req.body = resultat.data;
    next();
  };
}

const IDENTIFIANT = /^[A-Za-z0-9_-]{1,40}$/;
const ROLES = new Set(['employe', 'rh', 'admin']);

/** Paramètres d'URL : identifiants applicatifs (préfixe métier + aléa) ou rôle */
function verifierParametre(_req: Request, res: Response, next: NextFunction, valeur: unknown, nom: string): void {
  const valide = typeof valeur === 'string' && (nom === 'role' ? ROLES.has(valeur) : IDENTIFIANT.test(valeur));
  if (!valide) {
    res.status(400).json({ erreur: `Paramètre « ${nom} » invalide.` });
    return;
  }
  next();
}

/** Routeur d'une ressource, avec contrôle des paramètres d'URL */
export function routeur(): Router {
  const r = Router();
  for (const nom of ['id', 'employeId', 'elementId', 'serviceId', 'role']) r.param(nom, verifierParametre);
  return r;
}
