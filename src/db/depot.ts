import type { Transaction } from 'sequelize';
import type { Database } from '../types';
import { Meta, modeles, PermissionRole } from './modeles';
import { COLLECTIONS, JOURS_FERIES, PARAMETRES, type Colonne, type Table } from './schema';
import { sequelize } from './sequelize';

// Passage entre la base métier (objet Database, src/types) et les tables MySQL.

type Objet = Record<string, unknown>;

const lireChemin = (o: Objet, chemin: string): unknown => chemin.split('.').reduce<unknown>((v, k) => (v == null ? undefined : (v as Objet)[k]), o);

function ecrireChemin(o: Objet, chemin: string, valeur: unknown): void {
  const parties = chemin.split('.');
  let cible = o;
  for (const p of parties.slice(0, -1)) {
    if (cible[p] === undefined) cible[p] = {};
    cible = cible[p] as Objet;
  }
  cible[parties[parties.length - 1]] = valeur;
}

/** Objet métier → ligne SQL (clés = noms de colonnes) */
export function versLigne(t: Table, obj: Objet): Objet {
  const ligne: Objet = {};
  for (const c of t.colonnes) {
    const v = lireChemin(obj, c.prop);
    if (v === undefined || v === null) {
      if (c.nullite === 'requis') throw new Error(`${t.nom}.${c.nom} : valeur obligatoire manquante`);
      ligne[c.nom] = null;
    } else ligne[c.nom] = c.type === 'instant' ? new Date(v as string) : c.type === 'json' ? JSON.stringify(v) : v;
  }
  return ligne;
}

function valeurMetier(c: Colonne, brut: unknown): unknown {
  switch (c.type) {
    case 'instant':
      return (brut instanceof Date ? brut : new Date(brut as string)).toISOString();
    case 'entier':
    case 'reel':
    case 'montant':
      return Number(brut);
    case 'booleen':
      return Boolean(brut);
    case 'json':
      return typeof brut === 'string' ? JSON.parse(brut) : brut;
    default:
      return brut;
  }
}

/** Ligne SQL → objet métier : NULL restitue null (champ nullable) ou une propriété absente (champ optionnel) */
export function depuisLigne(t: Table, ligne: Objet): Objet {
  const obj: Objet = {};
  for (const c of t.colonnes) {
    const brut = ligne[c.nom];
    if (brut === null || brut === undefined) {
      if (c.prop.includes('.')) {
        const racine = c.prop.split('.')[0];
        if (obj[racine] === undefined) obj[racine] = {};
      }
      if (c.nullite === 'optionnel') continue;
      ecrireChemin(obj, c.prop, null);
    } else ecrireChemin(obj, c.prop, valeurMetier(c, brut));
  }
  return obj;
}

/** Base métier vide (avant toute donnée) */
export function baseVide(parametres: Database['parametres'], permissions: Database['permissions']): Database {
  return {
    version: 0,
    comptes: [],
    employes: [],
    pointages: [],
    conges: [],
    regularisations: [],
    demandesDocuments: [],
    documents: [],
    notifications: [],
    audit: [],
    evolutions: [],
    campagnesPaie: [],
    departements: [],
    sorties: [],
    permissions,
    parametres,
  };
}

/** Charge l'intégralité de la base métier depuis MySQL ; null si la base n'a jamais été initialisée */
export async function chargerBase(): Promise<Database | null> {
  const ligneParametres = await modeles[PARAMETRES.nom].findByPk(1, { raw: true });
  if (!ligneParametres) return null;
  const parametres = depuisLigne(PARAMETRES, ligneParametres as unknown as Objet);
  const feries = await modeles[JOURS_FERIES.nom].findAll({ where: { parametres_id: 1 }, order: [['ordre', 'ASC']], raw: true });
  parametres.joursFeries = feries.map((f) => depuisLigne(JOURS_FERIES, f as unknown as Objet));

  const permissions = Object.fromEntries((await PermissionRole.findAll({ raw: true })).map((r) => [(r as unknown as Objet).role, lireJson((r as unknown as Objet).permissions)]));
  const db = baseVide(parametres as unknown as Database['parametres'], permissions as Database['permissions']) as unknown as Objet;
  const revision = (await Meta.findByPk('revision', { raw: true })) as unknown as Objet | null;
  db.version = revision ? Number(revision.valeur) : 1;

  for (const c of COLLECTIONS) {
    const lignes = (await modeles[c.table.nom].findAll({ order: [['seq', 'ASC']], raw: true })) as unknown as Objet[];
    const objets = lignes.map((l) => depuisLigne(c.table, l));
    if ('enfant' in c && c.enfant) {
      const enfant = c.enfant;
      const parent = enfant.parent!;
      const toutes = (await modeles[enfant.nom].findAll({ order: [[parent.colonne, 'ASC'], ['ordre', 'ASC']], raw: true })) as unknown as Objet[];
      const parId = new Map<string, Objet[]>();
      for (const e of toutes) {
        const cle = String(e[parent.colonne]);
        if (!parId.has(cle)) parId.set(cle, []);
        parId.get(cle)!.push(depuisLigne(enfant, e));
      }
      objets.forEach((o) => (o[parent.propriete] = parId.get(String(o.id)) ?? []));
    }
    db[c.propriete] = objets;
  }
  return db as unknown as Database;
}

const lireJson = (v: unknown) => (typeof v === 'string' ? JSON.parse(v) : v);

const empreinte = (o: unknown) => JSON.stringify(o);

/**
 * Persiste les différences entre deux états de la base dans la transaction fournie :
 * suppressions (enfants avant parents), puis insertions / mises à jour (parents avant enfants).
 */
export async function persisterDifferences(ancien: Database, nouveau: Database, transaction: Transaction): Promise<number> {
  let operations = 0;
  const a = ancien as unknown as Record<string, Objet[]>;
  const n = nouveau as unknown as Record<string, Objet[]>;

  // 1. Suppressions, de la dernière collection à la première
  for (const c of [...COLLECTIONS].reverse()) {
    const conserves = new Set(n[c.propriete].map((o) => o.id as string));
    const supprimes = a[c.propriete].filter((o) => !conserves.has(o.id as string)).map((o) => o.id as string);
    if (supprimes.length) {
      await modeles[c.table.nom].destroy({ where: { id: supprimes }, transaction });
      operations += supprimes.length;
    }
  }

  // 2. Insertions et mises à jour
  for (const c of COLLECTIONS) {
    const avant = new Map(a[c.propriete].map((o) => [o.id as string, empreinte(o)]));
    const modifies = n[c.propriete].filter((o) => avant.get(o.id as string) !== empreinte(o));
    if (!modifies.length) continue;
    const champs = c.table.colonnes.map((col) => col.nom).filter((nom) => nom !== 'id');
    await modeles[c.table.nom].bulkCreate(
      modifies.map((o) => versLigne(c.table, o)),
      { updateOnDuplicate: champs, transaction },
    );
    operations += modifies.length;
    if ('enfant' in c && c.enfant) {
      const enfant = c.enfant;
      const parent = enfant.parent!;
      const ids = modifies.map((o) => o.id as string);
      await modeles[enfant.nom].destroy({ where: { [parent.colonne]: ids }, transaction });
      const lignes = modifies.flatMap((o) => ((o[parent.propriete] as Objet[]) ?? []).map((e, i) => ({ ...versLigne(enfant, e), [parent.colonne]: o.id, ordre: i })));
      if (lignes.length) await modeles[enfant.nom].bulkCreate(lignes, { transaction });
    }
  }

  // 3. Paramètres (ligne unique) et jours fériés
  if (empreinte(ancien.parametres) !== empreinte(nouveau.parametres)) {
    const p = nouveau.parametres as unknown as Objet;
    await modeles[PARAMETRES.nom].upsert({ id: 1, ...versLigne(PARAMETRES, p) }, { transaction });
    await modeles[JOURS_FERIES.nom].destroy({ where: { parametres_id: 1 }, transaction });
    const feries = (p.joursFeries as Objet[]).map((f, i) => ({ ...versLigne(JOURS_FERIES, f), parametres_id: 1, ordre: i }));
    if (feries.length) await modeles[JOURS_FERIES.nom].bulkCreate(feries, { transaction });
    operations += 1;
  }

  // 4. Matrice des permissions
  if (empreinte(ancien.permissions) !== empreinte(nouveau.permissions)) {
    for (const [role, permissions] of Object.entries(nouveau.permissions)) await PermissionRole.upsert({ role, permissions: JSON.stringify(permissions) }, { transaction });
    operations += 1;
  }

  // 5. Révision
  await Meta.upsert({ cle: 'revision', valeur: String(nouveau.version) }, { transaction });
  return operations;
}

/** Écrit une base complète (initialisation) : vide les tables puis insère tout */
/** Supprime toutes les données métier (les tables et l'historique des migrations sont conservés) */
async function supprimerDonnees(transaction: Transaction): Promise<void> {
  await sequelize.query('SET FOREIGN_KEY_CHECKS = 0', { transaction });
  for (const t of [...Object.keys(modeles), 'permissions_roles', 'meta']) await sequelize.query(`DELETE FROM \`${t}\``, { transaction });
  await sequelize.query('SET FOREIGN_KEY_CHECKS = 1', { transaction });
}

export async function viderBase(): Promise<void> {
  await sequelize.transaction(supprimerDonnees);
}

export async function ecrireBaseComplete(db: Database): Promise<void> {
  await sequelize.transaction(async (transaction) => {
    await supprimerDonnees(transaction);
    const vide = baseVide({ ...db.parametres, joursFeries: [], heureDebut: '' } as Database['parametres'], {} as Database['permissions']);
    await persisterDifferences(vide, db, transaction);
  });
}
