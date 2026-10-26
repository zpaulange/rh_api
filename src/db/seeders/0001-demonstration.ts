import { production } from '../../config';
import { securiserMotsDePasse } from '../../services/moteur';
import { canonique, differences } from '../controle';
import { creerBaseInitiale } from '../donnees/demonstration';
import { chargerBase, ecrireBaseComplete, viderBase } from '../depot';
import type { ContexteSeeder } from '../migrateur';

// Données de démonstration (collaborateurs, pointages, congés, paies, documents), datées par rapport au jour d'exécution.
// Comptes : admin@entreprise.bj / admin123 • rh@entreprise.bj / rh123 • k.mensah@entreprise.bj / employe123

export async function up(_: ContexteSeeder): Promise<void> {
  if (production) throw new Error('Données de démonstration refusées en production : utilisez « npm run db:initialiser:prod ».');
  if (await chargerBase()) throw new Error('La base contient déjà des données : seeder de démonstration non appliqué.');
  const base = creerBaseInitiale();
  securiserMotsDePasse(base);
  base.version = 1;
  await ecrireBaseComplete(base);
  // Contrôle d'aller-retour : la base relue doit être identique à la base écrite
  const relue = await chargerBase();
  if (!relue || canonique(relue) !== canonique(base)) throw new Error(`Écart entre la base écrite et la base relue :\n${differences(base, relue).join('\n')}`);
  console.log(`[seeder] ${base.employes.length} collaborateurs, ${base.pointages.length} pointages, ${base.conges.length} congés, ${base.campagnesPaie.length} paies, ${base.documents.length} documents`);
}

export async function down(_: ContexteSeeder): Promise<void> {
  if (production) throw new Error('Refusé en production.');
  await viderBase();
}
