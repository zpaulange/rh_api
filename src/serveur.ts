import { config } from './config';
import { chargerBase } from './db/depot';
import { migrationsEnAttente } from './db/migrateur';
import { expliquerErreurConnexion, sequelize } from './db/sequelize';
import { demarrerMoteur } from './services/moteur';
import { demarrerTaches } from './services/taches';
import { creerApplication } from './app';

async function demarrer(): Promise<void> {
  try {
    await sequelize.authenticate();
  } catch (err) {
    console.error(`[api] ${expliquerErreurConnexion(err)}`);
    process.exit(1);
  }
  // Le schéma est mis à jour explicitement (npm run db:migrer), jamais au démarrage
  const enAttente = await migrationsEnAttente();
  if (enAttente.length) {
    console.error(`[api] ${enAttente.length} migration(s) en attente (${enAttente.join(', ')}) : lancez « npm run db:migrer ».`);
    process.exit(1);
  }
  const db = await chargerBase();
  if (!db) {
    console.error('[api] Base vide : lancez « npm run db:seed » (données de démonstration) ou « npm run db:initialiser » (production).');
    process.exit(1);
  }
  demarrerMoteur(db);
  console.log(`[base] ${db.employes.length} collaborateur(s), révision ${db.version}`);
  const taches = demarrerTaches();

  const serveur = creerApplication().listen(config.PORT, () => console.log(`[api] SikaRH sur http://localhost:${config.PORT}/api (${config.NODE_ENV})`));

  const arreter = (signal: string) => {
    console.log(`[api] arrêt (${signal})`);
    clearInterval(taches);
    serveur.close(() => void sequelize.close().then(() => process.exit(0)));
    setTimeout(() => process.exit(0), 5000).unref();
  };
  process.on('SIGINT', () => arreter('SIGINT'));
  process.on('SIGTERM', () => arreter('SIGTERM'));
}

demarrer().catch((err) => {
  console.error('[api] démarrage impossible :', err);
  process.exit(1);
});
