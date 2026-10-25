import { peut } from '../metier/permissions';
import { notificationsPour } from './notifications.service';
import type { Compte, Database, Employe, Pointage, User } from '../types';

// Données transmises au navigateur selon l'utilisateur connecté.
//  - Employé : uniquement ses propres données (dossier, pointages, demandes, documents, paies versées).
//  - RH : toute la base de gestion, données d'identification sensibles masquées sans le droit correspondant.
//  - Administrateur : toute la base.
// Jamais : les empreintes de mot de passe, les notifications d'autrui, les photos (servies à part, avec contrôle d'accès).

const sansSecret = (c: Compte): Compte => ({ ...c, motDePasse: '' });
const photoEnLien = (p: Pointage): Pointage => (p.photo ? { ...p, photo: `/api/pointages/${encodeURIComponent(p.id)}/photo` } : p);
const masquerIdentite = (e: Employe): Employe => ({ ...e, cnss: '', ifu: '', npi: '', compteBancaire: '' });

export function vuePour(db: Database, user: User): Database {
  const communs = { version: db.version, parametres: db.parametres, permissions: db.permissions, departements: db.departements, notifications: notificationsPour(db, user) };

  if (user.role === 'employe') {
    const moi = user.employeId;
    const a = <T extends { employeId: string }>(liste: T[]) => liste.filter((x) => x.employeId === moi);
    return {
      ...communs,
      comptes: db.comptes.filter((c) => c.id === user.compteId).map(sansSecret),
      employes: db.employes.filter((e) => e.id === moi),
      pointages: a(db.pointages).map(photoEnLien),
      conges: a(db.conges),
      regularisations: a(db.regularisations),
      demandesDocuments: a(db.demandesDocuments),
      documents: a(db.documents),
      evolutions: a(db.evolutions),
      sorties: a(db.sorties),
      audit: [],
      // Seules ses lignes des paies versées (bulletins, attestations, cumuls)
      campagnesPaie: db.campagnesPaie
        .filter((c) => c.statut === 'payee' && c.lignes.some((l) => l.employeId === moi))
        .map((c) => ({ ...c, lignes: c.lignes.filter((l) => l.employeId === moi) })),
    };
  }

  const sensibles = user.role === 'admin' || peut(db, user, 'donnees_sensibles.consulter') || peut(db, user, 'paie.gerer');
  const paie = user.role === 'admin' || peut(db, user, 'paie.gerer') || peut(db, user, 'donnees_sensibles.consulter');
  const journal = user.role === 'admin' || peut(db, user, 'audit.consulter') || peut(db, user, 'tableau_bord.consulter');
  return {
    ...communs,
    comptes: db.comptes.map(sansSecret),
    employes: sensibles ? db.employes : db.employes.map(masquerIdentite),
    pointages: db.pointages.map(photoEnLien),
    conges: db.conges,
    regularisations: db.regularisations,
    demandesDocuments: db.demandesDocuments,
    documents: db.documents,
    evolutions: db.evolutions,
    sorties: db.sorties,
    audit: journal ? db.audit : [],
    campagnesPaie: paie ? db.campagnesPaie : [],
  };
}

/** Accès à la photo d'un pointage : le collaborateur concerné, ou la gestion des présences */
export function photoAccessible(db: Database, user: User, p: Pointage): boolean {
  return p.employeId === user.employeId || user.role === 'admin' || (user.role === 'rh' && peut(db, user, 'presences.gerer'));
}
