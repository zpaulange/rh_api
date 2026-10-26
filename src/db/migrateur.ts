import type { QueryInterface } from 'sequelize';
import { SequelizeStorage, Umzug } from 'umzug';
import { MIGRATIONS } from './migrations';
import './modeles';
import { SEEDERS } from './seeders';
import { sequelize } from './sequelize';

// Migrations (schéma) et seeders (données), versionnés dans les tables « migrations_sikarh » et « seeders_sikarh » :
// chaque fichier n'est appliqué qu'une fois, dans l'ordre de son nom.

export type ContexteMigration = { context: QueryInterface };
export type ContexteSeeder = { context: QueryInterface };

interface Etape {
  nom: string;
  module: { up(p: ContexteMigration): Promise<void>; down(p: ContexteMigration): Promise<void> };
}

const journal = (prefixe: string) => ({
  info: (e: Record<string, unknown>) => {
    if (e.event === 'migrating') console.log(`[${prefixe}] ${e.name} …`);
    if (e.event === 'migrated' || e.event === 'reverted') console.log(`[${prefixe}] ${e.name} ${e.event === 'migrated' ? 'appliqué' : 'annulé'}`);
    if (e.event === 'reverting') console.log(`[${prefixe}] annulation de ${e.name} …`);
  },
  warn: console.warn,
  error: console.error,
  debug: () => undefined,
});

const executeur = (etapes: Etape[], table: string, prefixe: string) =>
  new Umzug({
    migrations: etapes.map((e) => ({ name: e.nom, up: e.module.up, down: e.module.down })),
    context: sequelize.getQueryInterface(),
    storage: new SequelizeStorage({ sequelize, tableName: table }),
    logger: journal(prefixe),
  });

export const migrateur = executeur(MIGRATIONS, 'migrations_sikarh', 'migration');
export const semeur = executeur(SEEDERS, 'seeders_sikarh', 'seeder');

/** Migrations en attente (le serveur refuse de démarrer tant qu'il en reste) */
export async function migrationsEnAttente(): Promise<string[]> {
  return (await migrateur.pending()).map((m) => m.name);
}
