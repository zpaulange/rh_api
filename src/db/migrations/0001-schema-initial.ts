import { DataTypes, type QueryInterface } from 'sequelize';
import { attributs } from '../modeles';
import { COLLECTIONS, JOURS_FERIES, PARAMETRES, type Table } from '../schema';

// Schéma initial (version 1). Toute évolution ultérieure du schéma passe par une nouvelle migration
// et par la mise à jour correspondante de schema.ts.

const TABLES: Table[] = [
  ...COLLECTIONS.flatMap((c) => ('enfant' in c && c.enfant ? [c.table, c.enfant] : [c.table])).filter((t) => !t.parent),
  ...COLLECTIONS.flatMap((c) => ('enfant' in c && c.enfant ? [c.enfant] : [])),
  PARAMETRES,
  JOURS_FERIES,
];

const OPTIONS = { charset: 'utf8mb4', collate: 'utf8mb4_unicode_ci', engine: 'InnoDB' };

export async function up({ context: qi }: { context: QueryInterface }): Promise<void> {
  for (const t of TABLES) {
    await qi.createTable(t.nom, attributs(t), OPTIONS);
    for (const c of t.colonnes.filter((x) => x.index && !x.unique)) await qi.addIndex(t.nom, [c.nom], { name: `idx_${t.nom}_${c.nom}` });
    if (t.parent) await qi.addIndex(t.nom, [t.parent.colonne, 'ordre'], { name: `idx_${t.nom}_parent_ordre` });
    // Colonnes JSON stockées en texte : contenu garanti valide par la base
    for (const c of t.colonnes.filter((x) => x.type === 'json'))
      await qi.sequelize.query(`ALTER TABLE \`${t.nom}\` ADD CONSTRAINT \`chk_${t.nom}_${c.nom}\` CHECK (\`${c.nom}\` IS NULL OR JSON_VALID(\`${c.nom}\`))`);
  }
  await qi.createTable('permissions_roles', { role: { type: DataTypes.STRING(16), primaryKey: true }, permissions: { type: DataTypes.TEXT('long'), allowNull: false } }, OPTIONS);
  await qi.sequelize.query('ALTER TABLE `permissions_roles` ADD CONSTRAINT `chk_permissions_roles_permissions` CHECK (JSON_VALID(`permissions`))');
  await qi.createTable('meta', { cle: { type: DataTypes.STRING(64), primaryKey: true }, valeur: { type: DataTypes.STRING(191), allowNull: false } }, OPTIONS);
}

export async function down({ context: qi }: { context: QueryInterface }): Promise<void> {
  await qi.dropTable('meta');
  await qi.dropTable('permissions_roles');
  for (const t of [...TABLES].reverse()) await qi.dropTable(t.nom);
}
