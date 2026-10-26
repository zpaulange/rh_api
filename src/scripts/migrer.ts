import { migrateur } from '../db/migrateur';
import { commande } from './connexion';

// Migrations du schéma. Usage :
//   npm run db:migrer            applique les migrations en attente
//   npm run db:migrer:annuler    annule la dernière migration appliquée
//   npm run db:migrer:statut     liste les migrations appliquées et en attente
const action = process.argv[2] ?? 'appliquer';

await commande(async () => {
  if (action === 'appliquer') {
    const faites = await migrateur.up();
    console.log(faites.length ? `✔ ${faites.length} migration(s) appliquée(s). Étape suivante : npm run db:seed (démonstration)` : '✔ Schéma déjà à jour : aucune migration en attente.');
  } else if (action === 'annuler') {
    const annulees = await migrateur.down();
    console.log(annulees.length ? `✔ Migration annulée : ${annulees.map((m) => m.name).join(', ')}` : 'Aucune migration à annuler.');
  } else if (action === 'statut') {
    for (const m of await migrateur.executed()) console.log(`  ✔ ${m.name}`);
    for (const m of await migrateur.pending()) console.log(`  … ${m.name} (en attente)`);
  } else throw new Error(`Action inconnue : ${action} (appliquer, annuler, statut)`);
});
