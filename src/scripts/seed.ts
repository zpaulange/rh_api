import { semeur } from '../db/migrateur';
import { commande } from './connexion';

// Seeders (données). Usage :
//   npm run db:seed              exécute les seeders en attente (chacun une seule fois)
//   npm run db:seed:annuler      annule le dernier seeder exécuté
//   npm run db:seed:statut       liste les seeders exécutés et en attente
// L'API garde les données en mémoire : arrêtez-la pendant l'exécution des seeders, puis relancez-la.
const action = process.argv[2] ?? 'appliquer';

await commande(async () => {
  if (action === 'appliquer') {
    const faits = await semeur.up();
    console.log(faits.length ? `✔ ${faits.length} seeder(s) exécuté(s). Lancez l'API : npm run dev` : '✔ Aucun seeder en attente.');
    if (faits.some((s) => s.name.endsWith('demonstration'))) console.log('  Comptes : admin@entreprise.bj / admin123 • rh@entreprise.bj / rh123 • k.mensah@entreprise.bj / employe123');
  } else if (action === 'annuler') {
    const annules = await semeur.down();
    console.log(annules.length ? `✔ Seeder annulé : ${annules.map((s) => s.name).join(', ')}` : 'Aucun seeder à annuler.');
  } else if (action === 'statut') {
    for (const s of await semeur.executed()) console.log(`  ✔ ${s.name}`);
    for (const s of await semeur.pending()) console.log(`  … ${s.name} (en attente)`);
  } else throw new Error(`Action inconnue : ${action} (appliquer, annuler, statut)`);
});
