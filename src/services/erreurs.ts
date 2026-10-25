/** Données d'entrée invalides (400) */
export class ErreurValidation extends Error {}

/** Action non autorisée pour le rôle de l'utilisateur (403) */
export class ErreurAcces extends Error {}

/** Ressource introuvable ou non visible par l'utilisateur (404) */
export class ErreurIntrouvable extends Error {}
