import { serverNow } from '../metier/horloge';
import { heureHM } from '../metier/temps';
import type { Compte, User } from '../types';
import { mutate } from './noyau';
import { Acteur, SYSTEME, acteurDe, employe, journaliser, nomComplet, notifier } from './commun';

/* ================= Authentification ================= */

export type ResultatConnexion = { ok: true; compte: Compte } | { ok: false; erreur: string };

export interface OptionsAuthentification {
  /** Vérifie un mot de passe saisi contre la valeur stockée (empreinte bcrypt côté serveur) */
  verifier: (saisi: string, stocke: string) => boolean;
  /** Navigateur du client, conservé dans le journal des connexions */
  agent: string;
}

/** Contrôle des identifiants avec verrouillage après échecs répétés */
export function authentifier(email: string, motDePasse: string, options: OptionsAuthentification): ResultatConnexion {
  return mutate((db) => {
    const p = db.parametres;
    const compte = db.comptes.find((c) => c.email.toLowerCase() === email.trim().toLowerCase());
    const maintenant = serverNow();

    if (!compte) {
      journaliser(db, { ...SYSTEME, nom: email.trim() || 'Inconnu' }, 'ECHEC_CONNEXION', email.trim(), null, 'Compte inexistant');
      return { ok: false, erreur: 'Adresse email ou mot de passe incorrect.' };
    }
    const emp = employe(db, compte.employeId);
    const acteur: Acteur = { compteId: compte.id, employeId: emp.id, nom: nomComplet(emp), role: compte.role };

    if (compte.verrouilleJusqua && new Date(compte.verrouilleJusqua) > maintenant) {
      return { ok: false, erreur: `Compte temporairement verrouillé jusqu'à ${heureHM(compte.verrouilleJusqua)} suite à plusieurs échecs.` };
    }
    if (!options.verifier(motDePasse, compte.motDePasse)) {
      compte.tentativesEchouees += 1;
      journaliser(db, acteur, 'ECHEC_CONNEXION', compte.email, emp.id, `Tentative ${compte.tentativesEchouees}/${p.tentativesMax}`);
      if (compte.tentativesEchouees >= p.tentativesMax) {
        compte.verrouilleJusqua = new Date(maintenant.getTime() + p.verrouillageMinutes * 60000).toISOString();
        compte.tentativesEchouees = 0;
        journaliser(db, SYSTEME, 'COMPTE_VERROUILLE', compte.email, emp.id, `Verrouillage ${p.verrouillageMinutes} min`);
        notifier(db, {
          pour: { role: 'rh' },
          titre: 'Compte verrouillé',
          message: `${nomComplet(emp)} — ${p.tentativesMax} échecs de connexion`,
          lien: `/rh/employes/${emp.id}`,
          niveau: 'alerte',
        });
        // Sécurité : l'administrateur est prévenu de tout verrouillage (seul habilité pour les comptes RH et admin)
        notifier(db, {
          pour: { role: 'admin' },
          titre: 'Compte verrouillé',
          message: `${nomComplet(emp)} (${compte.role === 'employe' ? 'employé' : compte.role.toUpperCase()}) — ${p.tentativesMax} échecs de connexion`,
          lien: '/admin/utilisateurs',
          niveau: 'alerte',
        });
        return { ok: false, erreur: `Trop de tentatives : compte verrouillé ${p.verrouillageMinutes} minutes.` };
      }
      const restantes = p.tentativesMax - compte.tentativesEchouees;
      return { ok: false, erreur: `Adresse email ou mot de passe incorrect. ${restantes} tentative(s) restante(s).` };
    }
    if (!compte.actif) {
      journaliser(db, acteur, 'ECHEC_CONNEXION', compte.email, emp.id, 'Compte désactivé');
      return { ok: false, erreur: 'Votre accès a été désactivé. Contactez le service RH.' };
    }

    compte.tentativesEchouees = 0;
    compte.verrouilleJusqua = null;
    compte.derniereConnexion = maintenant.toISOString();
    journaliser(db, acteur, 'CONNEXION', compte.email, emp.id, `Connexion réussie • ${options.agent.split(') ')[0]}${options.agent.includes(')') ? ')' : ''}`);
    return { ok: true, compte: { ...compte } };
  });
}

export function journaliserDeconnexion(user: User, expiree: boolean) {
  mutate((db) =>
    journaliser(db, acteurDe(user), expiree ? 'SESSION_EXPIREE' : 'DECONNEXION', user.email, user.employeId, expiree ? 'Inactivité prolongée' : 'Déconnexion volontaire'),
  );
}
