import { migrer } from '../db/migrations';
import { sequelize } from '../db/sequelize';

await sequelize.authenticate();
await migrer();
console.log('[migration] schéma à jour');
await sequelize.close();
