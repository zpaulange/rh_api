import { config } from './config';
import { chargerBase } from './db/depot';
import { migrer } from './db/migrations';
import './db/modeles';
import { sequelize } from './db/sequelize';
import { demarrerMoteur } from './services/moteur';
import { demarrerTaches } from './services/taches';
import { creerApplication } from './app';

async function demarrer(): Promise<void> {
  await sequelize.authenticate();
  await migrer();
  const db = await chargerBase();
  if (!db) {
    console.error('Base vide : initialisez-la avec « npm run seed » (démonstration) ou « npm run initialiser » (production).');
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
