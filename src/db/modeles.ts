import { DataTypes, type ModelAttributeColumnOptions, type ModelStatic, type Model } from 'sequelize';
import { COLLECTIONS, JOURS_FERIES, PARAMETRES, type Colonne, type Table, type TypeColonne } from './schema';
import { sequelize } from './sequelize';

// Modèles Sequelize générés depuis la description du schéma (schema.ts)

export function typeSql(type: TypeColonne) {
  switch (type) {
    case 'id':
      return DataTypes.STRING(40);
    case 'chaine':
      return DataTypes.STRING(191);
    case 'court':
      return DataTypes.STRING(64);
    case 'texte':
      return DataTypes.TEXT;
    case 'texteLong':
      return DataTypes.TEXT('long');
    case 'date':
      return DataTypes.DATEONLY;
    case 'instant':
      return DataTypes.DATE(3);
    case 'entier':
      return DataTypes.INTEGER;
    case 'montant':
      return DataTypes.DECIMAL(15, 2);
    case 'reel':
      return DataTypes.DOUBLE;
    case 'booleen':
      return DataTypes.BOOLEAN;
    case 'json':
      // Le type JSON natif arrondit les décimaux à 15-16 chiffres : texte sérialisé + contrainte JSON_VALID
      return DataTypes.TEXT('long');
  }
}

export function attribut(c: Colonne, cle = false): ModelAttributeColumnOptions {
  return {
    type: typeSql(c.type),
    field: c.nom,
    allowNull: c.nullite !== 'requis',
    primaryKey: cle,
    unique: c.unique || undefined,
    ...(c.reference ? { references: { model: c.reference.table, key: c.reference.colonne }, onDelete: c.reference.suppression, onUpdate: 'CASCADE' } : {}),
  };
}

/** Attributs d'une table : clé métier « id », clé technique pour les tables enfants et la table singleton */
export function attributs(t: Table): Record<string, ModelAttributeColumnOptions> {
  const a: Record<string, ModelAttributeColumnOptions> = {};
  if (t.parent) {
    a.pk = { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true, field: 'pk' };
    a[t.parent.colonne] = { type: t.parent.table === 'parametres' ? DataTypes.INTEGER : DataTypes.STRING(40), allowNull: false, field: t.parent.colonne, references: { model: t.parent.table, key: 'id' }, onDelete: 'CASCADE' };
    a.ordre = { type: DataTypes.INTEGER, allowNull: false, field: 'ordre' };
  } else if (!t.colonnes.some((c) => c.prop === 'id')) {
    a.id = { type: DataTypes.INTEGER, primaryKey: true, field: 'id' };
  } else {
    // Rang d'insertion : restitue les collections dans l'ordre où elles ont été constituées
    a.seq = { type: DataTypes.INTEGER, autoIncrement: true, unique: true, allowNull: false, field: 'seq' };
  }
  for (const c of t.colonnes) a[c.nom] = attribut(c, !t.parent && c.prop === 'id');
  return a;
}

const definir = (t: Table): ModelStatic<Model> => sequelize.define(t.nom, attributs(t), { tableName: t.nom });

export const modeles: Record<string, ModelStatic<Model>> = {};
for (const t of [...COLLECTIONS.flatMap((c) => ('enfant' in c && c.enfant ? [c.table, c.enfant] : [c.table])), PARAMETRES, JOURS_FERIES]) modeles[t.nom] = definir(t);

/** Droits de gestion par rôle (Record<Role, Permission[]>) */
export const PermissionRole = sequelize.define(
  'permissions_roles',
  { role: { type: DataTypes.STRING(16), primaryKey: true }, permissions: { type: DataTypes.TEXT('long'), allowNull: false } },
  { tableName: 'permissions_roles' },
);

/** Métadonnées : révision de la base (incrémentée à chaque modification) */
export const Meta = sequelize.define(
  'meta',
  { cle: { type: DataTypes.STRING(64), primaryKey: true }, valeur: { type: DataTypes.STRING(191), allowNull: false } },
  { tableName: 'meta' },
);
