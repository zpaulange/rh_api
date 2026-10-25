// Description du schéma relationnel, alignée champ par champ sur le modèle métier (src/types).
// Une seule description sert aux modèles Sequelize (modeles.ts), à la conversion ligne SQL ↔ objet métier
// (depot.ts) et au contrôle de la migration initiale : aucun champ ne peut être oublié d'un côté.

export type TypeColonne =
  | 'id' // identifiant applicatif (VARCHAR 40)
  | 'chaine' // VARCHAR(191)
  | 'court' // VARCHAR(64) : énumérations, codes, références
  | 'texte' // TEXT
  | 'texteLong' // LONGTEXT (photos encodées)
  | 'date' // DATE « YYYY-MM-DD »
  | 'instant' // DATETIME(3) en UTC, restitué en ISO 8601
  | 'entier' // INT
  | 'montant' // DECIMAL(15,2) en FCFA
  | 'reel' // DOUBLE
  | 'booleen'
  | 'json'; // LONGTEXT sérialisé par l'application (restitution exacte des nombres) + CHECK JSON_VALID

/** requis : NOT NULL ; nullable : propriété « T | null » ; optionnel : propriété « T? » (absente ↔ NULL) */
export type Nullite = 'requis' | 'nullable' | 'optionnel';

export interface Colonne {
  /** Propriété de l'objet métier (chemin pointé autorisé : « pour.role ») */
  prop: string;
  /** Nom de la colonne SQL */
  nom: string;
  type: TypeColonne;
  nullite: Nullite;
  unique?: boolean;
  index?: boolean;
  reference?: { table: string; colonne: string; suppression: 'CASCADE' | 'RESTRICT' };
}

export interface Table {
  nom: string;
  colonnes: Colonne[];
  /** Table enfant d'un tableau imbriqué (services d'un département, lignes d'une paie…) :
   *  clé technique auto-incrémentée, clé étrangère vers le parent et rang dans le tableau */
  parent?: { colonne: string; table: string; propriete: string };
}

const snake = (s: string) => s.replace(/\./g, '_').replace(/[A-Z]/g, (m) => `_${m.toLowerCase()}`);

/** Colonne requise par défaut ; options : nullable, optionnel, unique, index, référence */
function col(prop: string, type: TypeColonne, options: Partial<Omit<Colonne, 'prop' | 'type'>> = {}): Colonne {
  return { prop, nom: options.nom ?? snake(prop), type, nullite: options.nullite ?? 'requis', ...options };
}
const nul = { nullite: 'nullable' as const };
const opt = { nullite: 'optionnel' as const };
const refEmploye = (suppression: 'CASCADE' | 'RESTRICT' = 'CASCADE') => ({ reference: { table: 'employes', colonne: 'id', suppression }, index: true });

/* ---------- Organisation ---------- */

export const DEPARTEMENTS: Table = {
  nom: 'departements',
  colonnes: [
    col('id', 'id'),
    col('code', 'court', { unique: true }),
    col('nom', 'chaine', { unique: true }),
    col('description', 'texte'),
    col('responsableId', 'id', nul),
    col('dateCreation', 'instant'),
  ],
};

export const SERVICES: Table = {
  nom: 'services',
  parent: { colonne: 'departement_id', table: 'departements', propriete: 'services' },
  colonnes: [col('id', 'id', { unique: true }), col('nom', 'chaine'), col('responsableId', 'id', nul)],
};

/* ---------- Personnel ---------- */

export const EMPLOYES: Table = {
  nom: 'employes',
  colonnes: [
    col('id', 'id'),
    col('matricule', 'court', { unique: true }),
    col('civilite', 'court'),
    col('prenom', 'chaine'),
    col('nom', 'chaine'),
    col('dateNaissance', 'date'),
    col('nationalite', 'chaine'),
    col('poste', 'chaine'),
    col('departement', 'chaine', { index: true }),
    col('service', 'chaine'),
    col('dateEmbauche', 'date'),
    col('dateSortie', 'date', nul),
    col('contrat', 'court'),
    col('categorie', 'court'),
    col('enfantsACharge', 'entier'),
    col('avantagesNature', 'json'),
    col('dirigeant', 'booleen'),
    col('premierEmploi', 'booleen'),
    col('heuresHebdo', 'reel'),
    col('responsable', 'chaine'),
    col('lieuTravail', 'chaine'),
    col('telPro', 'chaine'),
    col('telPerso', 'chaine'),
    col('emailPro', 'chaine'),
    col('emailPerso', 'chaine'),
    col('adresse', 'texte'),
    col('urgenceNom', 'chaine'),
    col('urgenceTel', 'chaine'),
    col('cnss', 'chaine'),
    col('ifu', 'chaine'),
    col('compteBancaire', 'chaine'),
    col('npi', 'chaine'),
    col('npiVerifie', 'booleen'),
    col('salaireBase', 'montant'),
    col('primesFixes', 'json'),
    col('avatarUrl', 'texte'),
  ],
};

export const COMPTES: Table = {
  nom: 'comptes',
  colonnes: [
    col('id', 'id'),
    col('email', 'chaine', { unique: true }),
    // Empreinte bcrypt : le mot de passe n'est jamais stocké en clair
    col('motDePasse', 'chaine'),
    col('role', 'court'),
    col('employeId', 'id', { ...refEmploye(), unique: true }),
    col('actif', 'booleen'),
    col('tentativesEchouees', 'entier'),
    col('verrouilleJusqua', 'instant', nul),
    col('derniereConnexion', 'instant', nul),
  ],
};

export const EVOLUTIONS: Table = {
  nom: 'evolutions',
  colonnes: [
    col('id', 'id'),
    col('reference', 'court'),
    col('employeId', 'id', refEmploye()),
    col('type', 'court'),
    col('dateEffet', 'date'),
    col('avant', 'json', nul),
    col('apres', 'json'),
    col('motif', 'texte'),
    col('decidePar', 'chaine'),
    col('dateDecision', 'instant'),
    col('statut', 'court'),
    col('documentId', 'id', nul),
  ],
};

export const SORTIES: Table = {
  nom: 'sorties',
  colonnes: [
    col('id', 'id'),
    col('reference', 'court'),
    col('employeId', 'id', refEmploye()),
    col('motif', 'court'),
    col('dateNotification', 'date'),
    col('dateSortie', 'date'),
    col('preavis', 'court'),
    col('joursLiberteNonUtilises', 'reel'),
    col('dateFinPreavis', 'date', nul),
    col('salaireMoyen', 'montant'),
    col('ancienneteAnnees', 'reel'),
    col('joursCongesRestants', 'reel'),
    col('rubriques', 'json'),
    col('montantDuParSalarie', 'montant'),
    col('observations', 'texte'),
    col('statut', 'court'),
    col('creePar', 'chaine'),
    col('dateCreation', 'instant'),
    col('certificatId', 'id', nul),
    col('soldeId', 'id', nul),
  ],
};

/* ---------- Temps & absences ---------- */

export const POINTAGES: Table = {
  nom: 'pointages',
  colonnes: [
    col('id', 'id'),
    col('employeId', 'id', refEmploye()),
    col('date', 'date', { index: true }),
    col('arrivee', 'instant'),
    col('depart', 'instant', nul),
    col('pauseMinutes', 'entier'),
    col('pauseDebut', 'instant', nul),
    col('source', 'court'),
    col('terminal', 'chaine'),
    col('retardMinutes', 'entier'),
    col('geo', 'json', nul),
    col('geoDepart', 'json', nul),
    col('photo', 'texteLong', nul),
    col('horodatage', 'court'),
  ],
};

export const CONGES: Table = {
  nom: 'conges',
  colonnes: [
    col('id', 'id'),
    col('reference', 'court'),
    col('employeId', 'id', refEmploye()),
    col('type', 'court'),
    col('debut', 'date'),
    col('debutPeriode', 'court'),
    col('fin', 'date'),
    col('finPeriode', 'court'),
    col('jours', 'reel'),
    col('motif', 'texte'),
    col('justificatif', 'chaine', nul),
    col('motifPermission', 'court', opt),
    col('dateAccouchementPresumee', 'date', opt),
    col('dateAccouchement', 'date', opt),
    col('prolongationMaladie', 'booleen', opt),
    col('statut', 'court', { index: true }),
    col('dateDemande', 'instant'),
    col('validateur', 'chaine'),
    col('traitePar', 'chaine', nul),
    col('dateTraitement', 'instant', nul),
    col('commentaireRH', 'texte', { nom: 'commentaire_rh' }),
  ],
};

export const REGULARISATIONS: Table = {
  nom: 'regularisations',
  colonnes: [
    col('id', 'id'),
    col('reference', 'court'),
    col('employeId', 'id', refEmploye()),
    col('type', 'court'),
    col('date', 'date'),
    col('entree', 'court'),
    col('depart', 'court'),
    col('motif', 'texte'),
    col('justificatif', 'chaine', nul),
    col('statut', 'court', { index: true }),
    col('dateDemande', 'instant'),
    col('traitePar', 'chaine', nul),
    col('dateTraitement', 'instant', nul),
    col('commentaireRH', 'texte', { nom: 'commentaire_rh' }),
  ],
};

/* ---------- Documents ---------- */

export const DEMANDES_DOCUMENTS: Table = {
  nom: 'demandes_documents',
  colonnes: [
    col('id', 'id'),
    col('reference', 'court'),
    col('employeId', 'id', refEmploye()),
    col('type', 'court'),
    col('destinataire', 'chaine'),
    col('format', 'court'),
    col('commentaire', 'texte'),
    col('statut', 'court', { index: true }),
    col('dateDemande', 'instant'),
    col('traitePar', 'chaine', nul),
    col('dateTraitement', 'instant', nul),
    col('documentId', 'id', nul),
    col('commentaireRH', 'texte', { nom: 'commentaire_rh' }),
    col('mois', 'court', opt),
  ],
};

export const DOCUMENTS: Table = {
  nom: 'documents',
  colonnes: [
    col('id', 'id'),
    col('reference', 'court', { index: true }),
    col('employeId', 'id', refEmploye()),
    col('modele', 'court'),
    col('categorie', 'court'),
    col('titre', 'chaine'),
    col('sousTitre', 'chaine'),
    col('date', 'instant'),
    col('code', 'court', { index: true }),
    col('empreinte', 'chaine'),
    col('generePar', 'chaine'),
    col('params', 'json'),
  ],
};

/* ---------- Paie ---------- */

export const CAMPAGNES_PAIE: Table = {
  nom: 'campagnes_paie',
  colonnes: [
    col('id', 'id'),
    col('reference', 'court'),
    col('mois', 'court', { unique: true }),
    col('statut', 'court'),
    col('creePar', 'chaine'),
    col('dateCreation', 'instant'),
    col('dateCalcul', 'instant'),
    col('valideePar', 'chaine', nul),
    col('dateValidation', 'instant', nul),
    col('payeePar', 'chaine', nul),
    col('datePaiement', 'instant', nul),
    col('modePaiement', 'chaine', nul),
  ],
};

export const LIGNES_PAIE: Table = {
  nom: 'lignes_paie',
  parent: { colonne: 'campagne_id', table: 'campagnes_paie', propriete: 'lignes' },
  colonnes: [
    col('employeId', 'id', refEmploye('RESTRICT')),
    col('matricule', 'court'),
    col('nom', 'chaine'),
    col('poste', 'chaine'),
    col('departement', 'chaine'),
    col('salaireReference', 'montant'),
    col('tauxHoraire', 'montant'),
    col('joursCalendaires', 'reel'),
    col('joursContrat', 'reel'),
    col('salaireBase', 'montant'),
    col('primesFixes', 'json'),
    col('heuresSup', 'json'),
    col('elements', 'json'),
    col('tauxAnciennete', 'reel'),
    col('primeAnciennete', 'montant'),
    col('joursAbsence', 'reel'),
    col('joursSansSolde', 'reel'),
    col('retenueAbsences', 'montant'),
    col('joursMaladie', 'reel'),
    col('joursMaladieDemiTraitement', 'reel'),
    col('joursMaladieNonIndemnises', 'reel'),
    col('retenueMaladie', 'montant'),
    col('joursCongePaye', 'reel'),
    col('complementAllocationConge', 'montant'),
    col('joursMaternite', 'reel'),
    col('joursFeries', 'reel'),
    col('brut', 'montant'),
    col('brutCotisable', 'montant'),
    col('brutImposable', 'montant'),
    col('cnssSalariale', 'montant'),
    col('baseIts', 'montant'),
    col('its', 'montant'),
    col('redevanceOrtb', 'montant'),
    col('indemnitesRupture', 'json'),
    col('avantagesNature', 'json'),
    col('vpsExonere', 'montant'),
    col('autresRetenues', 'montant'),
    col('net', 'montant'),
    col('cnssPatronale', 'montant'),
    col('vps', 'montant'),
    col('coutEmployeur', 'montant'),
    col('compteBancaire', 'chaine'),
    col('cnss', 'chaine'),
    col('ifu', 'chaine'),
  ],
};

/* ---------- Journal & notifications ---------- */

export const NOTIFICATIONS: Table = {
  nom: 'notifications',
  colonnes: [
    col('id', 'id'),
    col('date', 'instant'),
    col('pour.role', 'court', opt),
    col('pour.employeId', 'id', { ...opt, ...refEmploye() }),
    col('titre', 'chaine'),
    col('message', 'texte'),
    col('lien', 'chaine', opt),
    col('niveau', 'court'),
    col('lu', 'booleen'),
  ],
};

export const AUDIT: Table = {
  nom: 'audit',
  colonnes: [
    col('id', 'id'),
    col('date', 'instant', { index: true }),
    col('acteur', 'chaine'),
    col('acteurRole', 'court'),
    col('compteId', 'id', nul),
    col('action', 'court', { index: true }),
    col('cible', 'texte'),
    // Pas de clé étrangère : la trace survit à la suppression d'un dossier
    col('employeId', 'id', { ...nul, index: true }),
    col('details', 'texte'),
  ],
};

/* ---------- Paramètres & droits ---------- */

export const PARAMETRES: Table = {
  nom: 'parametres',
  colonnes: [
    col('heureDebut', 'court'),
    col('heureFin', 'court'),
    col('toleranceRetard', 'reel'),
    col('heuresJour', 'reel'),
    col('site', 'json'),
    col('geolocObligatoire', 'booleen'),
    col('photoObligatoire', 'booleen'),
    col('cpParMois', 'reel'),
    col('quotaPermissions', 'reel'),
    col('anticipationConges', 'booleen'),
    col('dateRepriseSoldes', 'date'),
    col('dateDebutPointage', 'date'),
    col('sessionMinutes', 'reel'),
    col('tentativesMax', 'reel'),
    col('verrouillageMinutes', 'reel'),
  ],
};

export const JOURS_FERIES: Table = {
  nom: 'jours_feries',
  parent: { colonne: 'parametres_id', table: 'parametres', propriete: 'joursFeries' },
  colonnes: [col('date', 'date'), col('libelle', 'chaine'), col('estime', 'booleen')],
};

/** Collections de la base métier, dans l'ordre d'insertion (parents avant enfants) */
export const COLLECTIONS = [
  { propriete: 'departements', table: DEPARTEMENTS, enfant: SERVICES },
  { propriete: 'employes', table: EMPLOYES },
  { propriete: 'comptes', table: COMPTES },
  { propriete: 'evolutions', table: EVOLUTIONS },
  { propriete: 'pointages', table: POINTAGES },
  { propriete: 'conges', table: CONGES },
  { propriete: 'regularisations', table: REGULARISATIONS },
  { propriete: 'demandesDocuments', table: DEMANDES_DOCUMENTS },
  { propriete: 'documents', table: DOCUMENTS },
  { propriete: 'notifications', table: NOTIFICATIONS },
  { propriete: 'audit', table: AUDIT },
  { propriete: 'campagnesPaie', table: CAMPAGNES_PAIE, enfant: LIGNES_PAIE },
  { propriete: 'sorties', table: SORTIES },
] as const;
