import { config } from '../config';
import { chargerBase, ecrireBaseComplete } from '../db/depot';
import { migrer } from '../db/migrations';
import '../db/modeles';
import { sequelize } from '../db/sequelize';
import { securiserMotsDePasse } from '../services/moteur';
import { creerBaseInitiale } from '../db/seeders/demonstration';
import { canonique, differences } from './outils';

// Données de démonstration (db/seeders/demonstration.ts), générées par rapport à la date du jour.
if (config.NODE_ENV === 'production' && !process.argv.includes('--force')) {
  console.error('Refusé en production (ajoutez --force si vous savez ce que vous faites).');
  process.exit(1);
}
await sequelize.authenticate();
await migrer();
const base = creerBaseInitiale();
securiserMotsDePasse(base);
base.version = 1;
await ecrireBaseComplete(base);

// Contrôle d'aller-retour : la base relue doit être identique à la base écrite
const relue = await chargerBase();
if (!relue || canonique(relue) !== canonique(base)) {
  console.error('[seed] ÉCART entre la base écrite et la base relue :\n', differences(base, relue).join('\n'));
  process.exit(1);
}
console.log(`[seed] base de démonstration écrite et vérifiée : ${base.employes.length} collaborateurs, ${base.pointages.length} pointages, ${base.conges.length} congés, ${base.campagnesPaie.length} paies, ${base.documents.length} documents, ${base.audit.length} entrées d'audit`);
console.log('[seed] comptes : admin@entreprise.bj / admin123 • rh@entreprise.bj / rh123 • k.mensah@entreprise.bj / employe123');
await sequelize.close();
