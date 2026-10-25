import type { Database, User } from '../types';

/** Utilisateur de session reconstruit depuis la base : un compte désactivé perd l'accès */
export function utilisateurDe(db: Database, compteId: string): User | null {
  const compte = db.comptes.find((c) => c.id === compteId);
  if (!compte || !compte.actif) return null;
  const e = db.employes.find((x) => x.id === compte.employeId);
  if (!e) return null;
  return {
    compteId: compte.id,
    employeId: e.id,
    email: compte.email,
    role: compte.role,
    prenom: e.prenom,
    nom: e.nom,
    departement: e.departement,
    matricule: e.matricule,
    avatarUrl: e.avatarUrl,
  };
}
