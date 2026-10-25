import { SequelizeStorage, Umzug } from 'umzug';
import * as m0001 from './migrations/0001-schema-initial';
import { sequelize } from './sequelize';

// Migrations versionnées (table « migrations_sikarh ») ; liste explicite pour fonctionner aussi une fois compilé
export const migrateur = new Umzug({
  migrations: [{ name: '0001-schema-initial', up: m0001.up, down: m0001.down }],
  context: sequelize.getQueryInterface(),
  storage: new SequelizeStorage({ sequelize, tableName: 'migrations_sikarh' }),
  logger: { info: (e) => console.log('[migration]', (e as { event?: string; name?: string }).event ?? '', (e as { name?: string }).name ?? ''), warn: console.warn, error: console.error, debug: () => undefined },
});

export async function migrer(): Promise<void> {
  const appliquees = await migrateur.up();
  if (appliquees.length) console.log(`[migration] ${appliquees.length} migration(s) appliquée(s)`);
}
