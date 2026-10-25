import * as carriereService from './carriere.service';
import * as sortiesService from './sorties.service';
import { moteur } from './moteur';

// Tâches planifiées du serveur (auparavant déclenchées par le navigateur à l'ouverture de l'application) :
// application des évolutions de carrière et des sorties arrivées à échéance.
async function echeances(): Promise<void> {
  try {
    const n = await moteur().executer(() => carriereService.appliquerEvolutionsEchues() + sortiesService.appliquerSortiesEchues());
    if (n) console.log(`[tâches] ${n} échéance(s) appliquée(s)`);
  } catch (err) {
    console.error('[tâches] échec des échéances', err);
  }
}

export function demarrerTaches(): NodeJS.Timeout {
  void echeances();
  // Chaque minute : une évolution ou une sortie prend effet dès minuit (heure du Bénin).
  // Sans échéance due, la vérification ne modifie rien (aucune écriture, aucune nouvelle révision).
  return setInterval(() => void echeances(), 60 * 1000);
}
