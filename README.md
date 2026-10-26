# SikaRH — API (backend)

Node.js 22 · Express 5 · TypeScript · MySQL 8 · Sequelize 6

## Architecture

```
src/
├── serveur.ts            démarrage : migrations, chargement de la base, tâches, écoute HTTP
├── app.ts                application Express (helmet, CORS, compression, JSON, anti-CSRF, routes, erreurs)
├── config.ts             variables d'environnement validées (zod)
├── routes/               une ressource REST par fichier : URL → middlewares → contrôleur
├── controleurs/          lisent la requête, appellent le service, renvoient { resultat, etat }
├── validateurs/          schémas zod des corps de requête (champs non prévus retirés)
├── middlewares/          session (cookie JWT), anti-CSRF, rôle requis, validation, erreurs
├── services/
│   ├── *.service.ts      règles de gestion par domaine : auth, pointages, conges, regularisations, absences,
│   │                     documents, employes, carriere, sorties, permissions, organisation, paie, parametres,
│   │                     notifications (droits, contrôles, journal d'audit, notifications)
│   ├── commun.ts         contrôle des permissions, journal d'audit, notifications, génération de documents
│   ├── noyau.ts          accès aux données des services (lecture, modification transactionnelle, identifiants)
│   ├── moteur.ts         commandes exclusives, persistance par différence dans MySQL, révisions
│   ├── vues.ts           données visibles selon l'utilisateur ; session.ts, taches.ts, commandes.ts, erreurs.ts
├── metier/               calculs purs : temps, jours fériés, congés, maternité, paie (CNSS, ITS), sortie,
│                         documents certifiés (empreinte SHA-256), permissions, géolocalisation, horloge
├── referentiels/         barèmes et constantes légales (Code du travail, CCGT, CGI), identité de l'entreprise
├── types/                modèle de données
├── db/                   Sequelize : schéma, modèles, dépôt, migrateur.ts (Umzug), migrations/, seeders/,
│                         donnees/demonstration.ts
└── scripts/              creer-base, generer, migrer, seed, initialiser, tests, vérification de persistance
```

Le backend est autonome : il n'importe aucun fichier du frontend. Le contrat entre les deux est l'API REST
ci-dessous et le format des données (`src/types`, repris dans `frontend/src/types`).

Chaque requête de modification suit la même chaîne :

1. `antiCsrf` : en-tête `X-SikaRH: 1` obligatoire ;
2. `authentifie` : cookie de session httpOnly `sikarh_session`, compte actif ;
3. `exigerGestion` / `exigerAdmin` : rôle requis par la route ;
4. `valider(schema)` : corps validé, champs inattendus retirés ; paramètres d'URL contrôlés ;
5. contrôleur → `executer()` → service : la règle de gestion s'exécute seule (file d'attente), sur une copie de l'état,
   puis les différences sont écrites dans MySQL en une transaction. En cas d'erreur, rien n'est écrit ;
6. réponse `{ resultat, etat }` (201 pour une création), où `etat` est la vue de l'utilisateur à jour.

Les droits fins (matrice des permissions) et les règles du Code du travail sont appliqués par les services.
Le serveur fait foi : les calculs du frontend (`frontend/src/lib`) ne servent qu'à l'affichage et aux aperçus.

Codes d'erreur : 400 données invalides · 401 session absente ou expirée · 403 rôle insuffisant ou CSRF ·
404 ressource inconnue · 413 corps trop volumineux · 422 refus d'une règle métier · 500 erreur technique.

## Endpoints (`/api`)

| Méthode | Chemin | Accès | Action |
|---|---|---|---|
| POST | `/auth/connexion` | public | connexion (verrouillage après échecs, limite par IP) |
| GET | `/auth/session` | public | reprise de session |
| POST | `/auth/deconnexion` | connecté | déconnexion |
| GET, HEAD | `/horloge` | public | heure du serveur (en-tête `Date`) |
| GET | `/sante` | public | état du service |
| GET | `/etat` | connecté | données visibles par l'utilisateur (ETag) |
| GET | `/evenements` | connecté | révisions en temps réel (SSE) |
| POST | `/pointages/arrivee` | connecté | pointage d'arrivée (photo, géolocalisation) |
| POST | `/pointages/pause` | connecté | début / fin de pause |
| POST | `/pointages/depart` | connecté | pointage de départ |
| GET | `/pointages/:id/photo` | concerné ou gestion | photo du pointage |
| POST | `/conges` | connecté | demande de congé ou de permission |
| POST | `/conges/:id/decision` | gestion | validation / refus |
| POST | `/conges/:id/accouchement` | gestion | date réelle d'accouchement |
| POST | `/conges/:id/prolongation` | gestion | prolongation de maternité |
| POST | `/regularisations` | connecté | demande de régularisation |
| POST | `/regularisations/:id/decision` | gestion | validation / refus |
| POST | `/absences/justification` | gestion | justification d'une absence |
| POST | `/absences/relance` | gestion | demande de justificatif |
| POST | `/demandes-documents` | connecté | demande de document |
| POST | `/demandes-documents/:id/traitement` | gestion | génération du document demandé |
| POST | `/demandes-documents/:id/refus` | gestion | refus |
| POST | `/documents` | gestion | génération directe |
| POST | `/documents/:id/telechargement` | propriétaire ou gestion | trace du téléchargement |
| POST | `/documents/verification` | connecté | vérification d'authenticité par code |
| PUT | `/profil/coordonnees` | connecté | coordonnées personnelles |
| POST | `/employes` | gestion | création du dossier et du compte |
| PATCH | `/employes/:id` | gestion | modification du dossier |
| DELETE | `/employes/:id` | gestion | suppression (dossier sans historique) |
| POST | `/employes/:id/consultation-donnees-sensibles` | gestion | trace de consultation |
| POST | `/employes/:id/evolutions` | gestion | promotion, augmentation, mutation… |
| POST | `/employes/:id/sortie` | gestion | sortie du collaborateur |
| POST | `/sorties/:id/annulation` | gestion | annulation d'une sortie |
| PATCH | `/comptes/:employeId/acces` | gestion | activer / désactiver l'accès |
| POST | `/comptes/:employeId/deverrouillage` | gestion | déverrouillage |
| POST | `/comptes/:employeId/mot-de-passe` | gestion | mot de passe temporaire |
| PATCH | `/comptes/:employeId/role` | admin | changement de rôle |
| PUT | `/permissions/:role` | admin | matrice des permissions |
| POST | `/departements` | gestion | création d'un département |
| PUT, DELETE | `/departements/:id` | gestion | modification / suppression |
| POST | `/departements/:id/services` | gestion | ajout d'un service |
| PUT, DELETE | `/departements/:id/services/:serviceId` | gestion | modification / suppression |
| POST | `/paies` | gestion | préparation d'une campagne |
| POST | `/paies/:id/recalcul` | gestion | recalcul |
| POST | `/paies/:id/elements` | gestion | prime / retenue exceptionnelle |
| DELETE | `/paies/:id/elements/:employeId/:elementId` | gestion | retrait d'un élément |
| POST | `/paies/:id/validation` | gestion | validation |
| POST | `/paies/:id/reouverture` | gestion | réouverture |
| POST | `/paies/:id/versement` | gestion | versement, distribution des bulletins |
| PUT | `/parametres` | gestion | paramètres de l'entreprise |
| POST | `/notifications/lues` | connecté | notifications lues (les siennes uniquement) |
| POST | `/exports/journal` | gestion | trace d'un export |
| POST | `/demo/reinitialiser` | admin, mode DEMO | réinitialisation des données de démonstration |

« gestion » = rôles RH et administrateur, sous réserve des permissions accordées au rôle.

## Base de données

L'API utilise le serveur MySQL / MariaDB installé sur la machine (administrable avec phpMyAdmin).
Connexion dans `.env` : `DB_HOTE`, `DB_PORT`, `DB_NOM`, `DB_UTILISATEUR`, `DB_MOT_DE_PASSE`
(mot de passe entre apostrophes s'il contient `$` ou `#`).

| Commande | Rôle |
|---|---|
| `npm run db:creer` | crée la base `DB_NOM` si elle n'existe pas (utf8mb4) |
| `npm run migration:generer -- <nom>` | crée `src/db/migrations/<horodatage>-<nom>.ts` (squelette `up` / `down`) et met à jour l'index |
| `npm run db:migrer` | applique les migrations en attente (table `migrations_sikarh`) |
| `npm run db:migrer:annuler` | annule la dernière migration |
| `npm run db:migrer:statut` | migrations appliquées et en attente |
| `npm run seeder:generer -- <nom>` | crée `src/db/seeders/<horodatage>-<nom>.ts` et met à jour l'index |
| `npm run db:seed` | exécute les seeders en attente, chacun une seule fois (table `seeders_sikarh`) |
| `npm run db:seed:annuler` | annule le dernier seeder (le seeder de démonstration vide les données) |
| `npm run db:seed:statut` | seeders exécutés et en attente |
| `npm run db:initialiser` | base de production : paramètres légaux et compte administrateur (variables `ADMIN_*`) |

Une migration qui ajoute, renomme ou supprime une colonne doit aussi être reportée dans `src/db/schema.ts`.
L'API garde les données en mémoire : arrêtez-la avant `db:seed`, `db:seed:annuler` ou `db:migrer:annuler`.

## Démarrage (développement)

```bash
npm install
npm run db:creer              # base « sikarh » sur le serveur MySQL local
npm run db:migrer             # tables
npm run db:seed               # données de démonstration
npm run dev                   # API sur http://localhost:4000/api (redémarre à chaque modification)
```

Frontend : `cd ../frontend && npm run dev` (le proxy Vite redirige `/api` vers le port 4000).

Au démarrage, l'API vérifie la base : base absente, migration en attente ou base vide sont signalées
avec la commande à lancer.

Comptes de démonstration : `admin@entreprise.bj` / `admin123`, `rh@entreprise.bj` / `rh123`,
`k.mensah@entreprise.bj` / `employe123`.

## Production

```bash
npm run build                 # dist/serveur.js, creer-base.js, migrer.js, initialiser.js
npm run db:creer:prod
npm run db:migrer:prod
npm run db:initialiser:prod   # première installation uniquement
npm start
```

`NODE_ENV=production`, `COOKIE_SECURISE=true` (HTTPS), `DEMO=false`, `LIMITE_ECHECS_CONNEXION=30`, `CORS_ORIGINE` = adresse du frontend.

## Tests

Contre un serveur démarré en mode DEMO (les tests réinitialisent la base de démonstration) :

```bash
npm run typecheck
npm test                                     # sécurité, droits, validation, temps réel (58 contrôles)
cd ../frontend && npm run test:api           # client du frontend : les 47 actions des écrans (101 contrôles)
cd ../backend && npx tsx src/scripts/verifier-persistance.ts   # état servi identique à la base MySQL
```

`LIMITE_ECHECS_CONNEXION` (30 par défaut) limite les échecs de connexion par adresse IP sur 15 minutes ;
les tests en provoquent volontairement, d'où la valeur 300 dans le `.env` de développement.
