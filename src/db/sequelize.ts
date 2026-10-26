import { Sequelize } from 'sequelize';
import { config, production } from '../config';

// Connexion MySQL : dates en UTC (restituées en ISO 8601), DECIMAL restitués en nombres
export const sequelize = new Sequelize(config.DB_NOM, config.DB_UTILISATEUR, config.DB_MOT_DE_PASSE, {
  host: config.DB_HOTE,
  port: config.DB_PORT,
  dialect: 'mysql',
  timezone: '+00:00',
  logging: production ? false : (sql) => (process.env.SQL_LOG === 'true' ? console.log(sql) : undefined),
  dialectOptions: { decimalNumbers: true, supportBigNumbers: true, dateStrings: false, charset: 'utf8mb4' },
  define: { charset: 'utf8mb4', collate: 'utf8mb4_unicode_ci', timestamps: false, freezeTableName: true },
  pool: { max: 10, min: 0, idle: 10_000 },
});

/** Message explicite pour les erreurs de connexion les plus courantes */
export function expliquerErreurConnexion(err: unknown): string {
  const code = (err as { original?: { code?: string }; parent?: { code?: string }; code?: string }).original?.code ?? (err as { parent?: { code?: string } }).parent?.code ?? (err as { code?: string }).code;
  const serveur = `${config.DB_HOTE}:${config.DB_PORT}`;
  switch (code) {
    case 'ER_BAD_DB_ERROR':
      return `La base « ${config.DB_NOM} » n'existe pas sur ${serveur} : créez-la avec « npm run db:creer ».`;
    case 'ER_ACCESS_DENIED_ERROR':
    case 'ER_DBACCESS_DENIED_ERROR':
      return `Accès refusé pour l'utilisateur « ${config.DB_UTILISATEUR} » sur ${serveur} : vérifiez DB_UTILISATEUR et DB_MOT_DE_PASSE dans .env.`;
    case 'ECONNREFUSED':
    case 'ENOTFOUND':
    case 'ETIMEDOUT':
      return `Serveur MySQL injoignable sur ${serveur} : vérifiez qu'il est démarré, ainsi que DB_HOTE et DB_PORT dans .env.`;
    default:
      return err instanceof Error ? err.message : String(err);
  }
}
