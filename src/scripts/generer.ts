import { existsSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

// Génère un fichier de migration ou de seeder daté, puis met à jour l'index du dossier. Usage :
//   npm run migration:generer -- ajout-telephone-urgence
//   npm run seeder:generer -- jours-feries-2027
const [type, ...mots] = process.argv.slice(2);
if (type !== 'migration' && type !== 'seeder') {
  console.error('Usage : npm run migration:generer -- <nom>   |   npm run seeder:generer -- <nom>');
  process.exit(1);
}
const nom = mots
  .join('-')
  .normalize('NFD')
  .replace(/[̀-ͯ]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-|-$/g, '');
if (!nom) {
  console.error(`Indiquez un nom : npm run ${type}:generer -- <nom>`);
  process.exit(1);
}

const dossier = join(import.meta.dirname, '..', 'db', type === 'migration' ? 'migrations' : 'seeders');
const horodatage = new Date().toISOString().replace(/\D/g, '').slice(0, 14);
const fichier = `${horodatage}-${nom}`;
if (existsSync(join(dossier, `${fichier}.ts`))) {
  console.error(`Le fichier ${fichier}.ts existe déjà.`);
  process.exit(1);
}

const MODELES = {
  migration: `import { DataTypes } from 'sequelize';
import type { ContexteMigration } from '../migrateur';

// Migration « ${nom} ».
// Toute colonne ajoutée, renommée ou supprimée doit aussi être décrite dans src/db/schema.ts
// (correspondance entre le modèle métier et les tables).

export async function up({ context: qi }: ContexteMigration): Promise<void> {
  // Exemple : await qi.addColumn('employes', 'nouvelle_colonne', { type: DataTypes.STRING(120), allowNull: true });
  void qi;
  void DataTypes;
}

export async function down({ context: qi }: ContexteMigration): Promise<void> {
  // Exemple : await qi.removeColumn('employes', 'nouvelle_colonne');
  void qi;
}
`,
  seeder: `import type { ContexteSeeder } from '../migrateur';

// Seeder « ${nom} » : exécuté une seule fois par « npm run db:seed » (suivi dans la table seeders_sikarh).

export async function up({ context: qi }: ContexteSeeder): Promise<void> {
  // Exemple : await qi.bulkInsert('jours_feries', [{ ... }]);
  void qi;
}

export async function down({ context: qi }: ContexteSeeder): Promise<void> {
  // Exemple : await qi.bulkDelete('jours_feries', { ... });
  void qi;
}
`,
};
writeFileSync(join(dossier, `${fichier}.ts`), MODELES[type]);

// Index régénéré à partir des fichiers du dossier, dans l'ordre de leur nom
const fichiers = readdirSync(dossier)
  .filter((f) => f.endsWith('.ts') && f !== 'index.ts')
  .map((f) => f.slice(0, -3))
  .sort();
const liste = type === 'migration' ? 'MIGRATIONS' : 'SEEDERS';
const lettre = type === 'migration' ? 'm' : 's';
writeFileSync(
  join(dossier, 'index.ts'),
  `// Fichier généré par « npm run ${type}:generer » : ne pas modifier à la main.
// Liste explicite (et non une lecture du dossier) pour fonctionner aussi une fois l'API compilée.
${fichiers.map((f, i) => `import * as ${lettre}${i} from './${f}';`).join('\n')}

export const ${liste} = [${fichiers.map((f, i) => `{ nom: '${f}', module: ${lettre}${i} }`).join(', ')}];
`,
);
console.log(`✔ ${type === 'migration' ? 'Migration créée' : 'Seeder créé'} : src/db/${type === 'migration' ? 'migrations' : 'seeders'}/${fichier}.ts`);
console.log(`  Complétez up() et down(), puis lancez : npm run ${type === 'migration' ? 'db:migrer' : 'db:seed'}`);
