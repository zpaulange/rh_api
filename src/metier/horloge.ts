// Horodatage : l'horloge du serveur fait foi pour tous les horodatages métier (jamais celle du poste client)

export const serverNow = (): Date => new Date();
export const serverNowISO = (): string => serverNow().toISOString();
export const timeSource = (): 'serveur' => 'serveur';
