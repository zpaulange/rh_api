import bcrypt from 'bcryptjs';
import { EventEmitter } from 'node:events';
import { persisterDifferences } from '../db/depot';
import { sequelize } from '../db/sequelize';
import { installerMoteur, type MoteurDonnees } from './noyau';
import type { Database } from '../types';

// Moteur de données du serveur.
//  - L'état métier complet est chargé de MySQL au démarrage et reste en mémoire (source de lecture).
//  - Chaque commande s'exécute seule (file d'attente) : les services métier modifient une copie de
//    travail, les différences sont écrites dans une transaction MySQL, puis l'état est remplacé.
//  - Si l'action échoue (règle métier) ou si l'écriture échoue, rien n'est conservé : la commande est atomique.
//  - Une seule instance du serveur doit écrire dans la base (l'état en mémoire fait foi).

const BCRYPT = /^\$2[aby]\$\d{2}\$/;
const COUT_BCRYPT = 11;

class MoteurServeur implements MoteurDonnees {
  private etat: Database;
  private brouillon: Database | null = null;
  private enCommande = false;
  private file: Promise<unknown> = Promise.resolve();
  readonly evenements = new EventEmitter();

  constructor(etat: Database) {
    this.etat = etat;
    this.evenements.setMaxListeners(0);
  }

  get revision(): number {
    return this.etat.version;
  }

  lire(): Database {
    return this.brouillon ?? this.etat;
  }

  modifier<T>(recette: (db: Database) => T): T {
    if (!this.enCommande) throw new Error('Modification de données hors d’une commande serveur.');
    const copie = structuredClone(this.lire());
    const resultat = recette(copie);
    this.brouillon = copie;
    return resultat;
  }

  /** Exécute une commande métier de façon exclusive et atomique */
  executer<T>(commande: () => T): Promise<T> {
    const tache = this.file.then(async () => {
      this.enCommande = true;
      this.brouillon = null;
      try {
        const resultat = commande();
        if (this.brouillon) {
          const nouveau: Database = this.brouillon;
          securiserMotsDePasse(nouveau);
          nouveau.version = this.etat.version + 1;
          await sequelize.transaction((transaction) => persisterDifferences(this.etat, nouveau, transaction));
          this.etat = nouveau;
          this.evenements.emit('revision', nouveau.version);
        }
        return resultat;
      } finally {
        this.brouillon = null;
        this.enCommande = false;
      }
    });
    // Une commande en échec ne bloque pas les suivantes
    this.file = tache.catch(() => undefined);
    return tache;
  }

  /** Remplace intégralement l'état après l'écriture complète de la base, sans qu'aucune commande ne s'intercale */
  remplacer(etat: Database, ecrire: (etat: Database) => Promise<void>): Promise<void> {
    const tache = this.file.then(async () => {
      etat.version = this.etat.version + 1;
      await ecrire(etat);
      this.etat = etat;
      this.evenements.emit('revision', etat.version);
    });
    this.file = tache.catch(() => undefined);
    return tache;
  }
}

/** Aucun mot de passe en clair n'est jamais persisté : hachage bcrypt avant écriture */
function securiserMotsDePasse(db: Database): void {
  for (const c of db.comptes) if (!BCRYPT.test(c.motDePasse)) c.motDePasse = bcrypt.hashSync(c.motDePasse, COUT_BCRYPT);
}

export const verifierMotDePasse = (saisi: string, empreinte: string): boolean => BCRYPT.test(empreinte) && bcrypt.compareSync(saisi, empreinte);

let instance: MoteurServeur | null = null;

export function demarrerMoteur(etat: Database): MoteurServeur {
  instance = new MoteurServeur(etat);
  installerMoteur(instance);
  return instance;
}

export function moteur(): MoteurServeur {
  if (!instance) throw new Error('Moteur non démarré');
  return instance;
}

export { securiserMotsDePasse };
