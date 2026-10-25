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
