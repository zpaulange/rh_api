import { z } from 'zod';
import { AVANTAGES_NATURE, MOTIFS_SORTIE } from '../referentiels/paie';
import { TOUTES_PERMISSIONS } from '../metier/permissions';
import { date, enumDe, id, montant, primeFixe, role, texte } from './communs';

// Collaborateurs, comptes, carrière, sortie, organisation, droits

const champsEmploye = {
  civilite: z.enum(['M.', 'Mme']),
  prenom: texte(80).min(1),
  nom: texte(80).min(1),
  dateNaissance: date,
  nationalite: texte(60),
  poste: texte(120).min(1),
  departement: texte(120).min(1),
  service: texte(120),
  dateEmbauche: date,
  contrat: z.enum(['CDI', 'CDD', 'Stage']),
  categorie: z.enum(['occasionnel', 'execution', 'maitrise_cadre']),
  enfantsACharge: z.number().int().min(0).max(30),
  avantagesNature: z.array(enumDe(AVANTAGES_NATURE)).max(10),
  dirigeant: z.boolean(),
  premierEmploi: z.boolean(),
  heuresHebdo: z.number().min(1).max(60),
  responsable: texte(120),
  lieuTravail: texte(120),
  telPro: texte(40),
  telPerso: texte(40),
  emailPro: z.string().email().max(191),
  emailPerso: texte(191),
  adresse: texte(300),
  urgenceNom: texte(120),
  urgenceTel: texte(40),
  cnss: texte(40),
  ifu: texte(40),
  compteBancaire: texte(120),
  npi: texte(40),
  salaireBase: montant,
  primesFixes: z.array(primeFixe).max(30),
};

export const creationEmploye = z.object({ donnees: z.object(champsEmploye), role });

// Les champs de carrière (poste, département, salaire, primes) évoluent par une évolution datée
export const modificationEmploye = z.object({ ...champsEmploye, npiVerifie: z.boolean() }).omit({ poste: true, departement: true, salaireBase: true, primesFixes: true }).partial();

export const coordonnees = z.object({ telPerso: texte(40), emailPerso: texte(191), adresse: texte(300), urgenceNom: texte(120), urgenceTel: texte(40) });

export const evolution = z.object({
  type: z.enum(['promotion', 'augmentation', 'mutation', 'reclassement']),
  dateEffet: date,
  apres: z.object({ poste: texte(120), departement: texte(120), salaireBase: montant, primesFixes: z.array(primeFixe).max(30) }),
  motif: texte(500),
});

export const sortie = z.object({
  motif: enumDe(MOTIFS_SORTIE),
  dateNotification: date,
  dateSortie: date,
  preavis: z.enum(['effectue', 'dispense_employeur', 'non_effectue_salarie', 'sans_objet']),
  joursLiberteNonUtilises: z.number().min(0).max(60).optional(),
  observations: texte(300),
});

export const acces = z.object({ actif: z.boolean() });
export const changementRole = z.object({ role, motif: texte(300) });
export const permissions = z.object({ permissions: z.array(z.enum(TOUTES_PERMISSIONS as [string, ...string[]])) });

export const departement = z.object({ code: texte(6), nom: texte(60), description: texte(200), responsableId: id.nullable() });
export const service = z.object({ nom: texte(60), responsableId: id.nullable() });
