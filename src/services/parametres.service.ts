import type { Parametres, User } from '../types';
import { mutate } from './noyau';
import { acteurDe, exiger, journaliser } from './commun';

/* ================= Rapports & paramètres ================= */

export function journaliserExport(user: User, rapport: string, format: 'CSV' | 'PDF', lignes: number): void {
  mutate((db) => journaliser(db, acteurDe(user), 'EXPORT_RAPPORT', rapport, null, `${format} • ${lignes} ligne(s)`));
}

export function modifierParametres(user: User, p: Parametres): void {
  mutate((db) => {
    exiger(db, user, 'parametres.gerer');
    const avant = db.parametres;
    const changes = (Object.keys(p) as (keyof Parametres)[])
      .filter((k) => JSON.stringify(p[k]) !== JSON.stringify(avant[k]))
      .map((k) => k);
    if (changes.length === 0) return;
    db.parametres = p;
    journaliser(db, acteurDe(user), 'MODIFICATION_PARAMETRES', 'Paramètres RH', null, `Modifiés : ${changes.join(', ')}`);
  });
}
