import { expliquerErreurConnexion, sequelize } from '../db/sequelize';

/** Exécute une commande sur la base, puis ferme la connexion ; en cas d'échec, message clair et code de sortie 1 */
export async function commande(action: () => Promise<void>): Promise<void> {
  try {
    await sequelize.authenticate();
    await action();
  } catch (err) {
    console.error(`✘ ${expliquerErreurConnexion(err)}`);
    process.exitCode = 1;
  } finally {
    await sequelize.close().catch(() => undefined);
  }
}
