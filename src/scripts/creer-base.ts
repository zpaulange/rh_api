import mysql from 'mysql2/promise';
import { config } from '../config';
import { expliquerErreurConnexion } from '../db/sequelize';

// Crée la base de données si elle n'existe pas (jeu de caractères utf8mb4, tri Unicode). Usage : npm run db:creer
if (!/^[A-Za-z0-9_]{1,64}$/.test(config.DB_NOM)) {
  console.error(`✘ Nom de base invalide : « ${config.DB_NOM} » (lettres, chiffres et _ uniquement).`);
  process.exit(1);
}
try {
  const connexion = await mysql.createConnection({ host: config.DB_HOTE, port: config.DB_PORT, user: config.DB_UTILISATEUR, password: config.DB_MOT_DE_PASSE });
  const [existantes] = await connexion.query('SHOW DATABASES LIKE ?', [config.DB_NOM]);
  if ((existantes as unknown[]).length) console.log(`✔ La base « ${config.DB_NOM} » existe déjà sur ${config.DB_HOTE}:${config.DB_PORT}.`);
  else {
    await connexion.query(`CREATE DATABASE \`${config.DB_NOM}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    console.log(`✔ Base « ${config.DB_NOM} » créée sur ${config.DB_HOTE}:${config.DB_PORT} (utf8mb4). Étape suivante : npm run db:migrer`);
  }
  await connexion.end();
} catch (err) {
  console.error(`✘ ${expliquerErreurConnexion(err)}`);
  process.exit(1);
}
