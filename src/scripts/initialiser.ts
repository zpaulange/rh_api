import { z } from 'zod';
import { chargerBase, ecrireBaseComplete } from '../db/depot';
import { migrationsEnAttente } from '../db/migrateur';
import { sequelize } from '../db/sequelize';
import { securiserMotsDePasse } from '../services/moteur';
import { creerBaseInitiale } from '../db/donnees/demonstration';
import { serverNowISO } from '../metier/horloge';
import { PERMISSIONS_PAR_DEFAUT } from '../metier/permissions';
import { dateKey } from '../metier/temps';
import type { Database } from '../types';

// Initialisation d'une base de production vierge : paramètres et jours fériés légaux, un département
// « Direction générale » et le compte administrateur décrit par les variables d'environnement.
// Usage (après npm run db:creer et npm run db:migrer) :
//   ADMIN_EMAIL=… ADMIN_MOT_DE_PASSE=… ADMIN_PRENOM=… ADMIN_NOM=… npm run db:initialiser
const env = z
  .object({
    ADMIN_EMAIL: z.string().email(),
    ADMIN_MOT_DE_PASSE: z.string().min(12, 'au moins 12 caractères'),
    ADMIN_PRENOM: z.string().min(1),
    ADMIN_NOM: z.string().min(1),
  })
  .safeParse(process.env);
if (!env.success) {
  console.error('Variables requises :', env.error.issues.map((i) => `${i.path.join('.')} (${i.message})`).join(', '));
  process.exit(1);
}
await sequelize.authenticate();
if ((await migrationsEnAttente()).length) {
  console.error('Migrations en attente : lancez d’abord « npm run db:migrer ».');
  process.exit(1);
}
if (await chargerBase()) {
  console.error('La base contient déjà des données : initialisation annulée.');
  process.exit(1);
}
const modele = creerBaseInitiale();
const aujourdhui = dateKey(new Date());
const e = env.data;
const base: Database = {
  version: 1,
  parametres: { ...modele.parametres, dateRepriseSoldes: aujourdhui, dateDebutPointage: aujourdhui },
  permissions: { admin: [...PERMISSIONS_PAR_DEFAUT.admin], rh: [...PERMISSIONS_PAR_DEFAUT.rh], employe: [] },
  departements: [{ id: 'dep-dg', code: 'DG', nom: 'Direction générale', description: '', responsableId: 'e-admin', services: [], dateCreation: serverNowISO() }],
  employes: [
    {
      ...modele.employes.find((x) => x.id === 'e-admin')!,
      id: 'e-admin',
      matricule: 'BN-0001',
      civilite: 'M.',
      prenom: e.ADMIN_PRENOM,
      nom: e.ADMIN_NOM,
      poste: 'Administrateur',
      departement: 'Direction générale',
      service: '',
      dateEmbauche: aujourdhui,
      emailPro: e.ADMIN_EMAIL.toLowerCase(),
      telPro: '',
      telPerso: '',
      emailPerso: '',
      adresse: '',
      urgenceNom: '',
      urgenceTel: '',
      cnss: '',
      ifu: '',
      compteBancaire: '',
      npi: '',
      npiVerifie: false,
      avatarUrl: '',
      avantagesNature: [],
      primesFixes: [],
    },
  ],
  comptes: [{ id: 'c-admin', email: e.ADMIN_EMAIL.toLowerCase(), motDePasse: e.ADMIN_MOT_DE_PASSE, role: 'admin', employeId: 'e-admin', actif: true, tentativesEchouees: 0, verrouilleJusqua: null, derniereConnexion: null }],
  pointages: [],
  conges: [],
  regularisations: [],
  demandesDocuments: [],
  documents: [],
  notifications: [],
  audit: [],
  evolutions: [],
  campagnesPaie: [],
  sorties: [],
};
securiserMotsDePasse(base);
await ecrireBaseComplete(base);
console.log(`[initialisation] base créée ; administrateur : ${e.ADMIN_EMAIL}. Complétez son dossier et les paramètres depuis l'application.`);
await sequelize.close();
