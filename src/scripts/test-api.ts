// Tests d'intégration de l'API SikaRH, contre un serveur démarré (npm run dev ou npm start) en mode DEMO.
// Usage : npm test   (API_URL=http://localhost:4000/api par défaut)
// La base de démonstration est réinitialisée au début : ne jamais lancer contre une base de production.

import type { Database, DocumentGenere, User } from '../types';

const API = process.env.API_URL ?? 'http://localhost:4000/api';
let echecs = 0;
let total = 0;
const ok = (condition: boolean, message: string) => {
  total += 1;
  if (!condition) echecs += 1;
  console.log(`${condition ? '✔' : '✘'} ${message}`);
};

/** Client HTTP avec son propre cookie de session (un navigateur) */
class Client {
  cookie = '';
  constructor(readonly nom: string) {}

  async appel<T = unknown>(chemin: string, options: { methode?: string; corps?: unknown; csrf?: boolean } = {}): Promise<{ statut: number; donnees: T }> {
    const res = await fetch(`${API}${chemin}`, {
      method: options.methode ?? 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(options.csrf === false ? {} : { 'X-SikaRH': '1' }),
        ...(this.cookie ? { Cookie: this.cookie } : {}),
      },
      body: options.corps === undefined ? undefined : JSON.stringify(options.corps),
    });
    const pose = res.headers.get('set-cookie');
    if (pose) this.cookie = /sikarh_session=([^;]*)/.exec(pose)?.[1] ? `sikarh_session=${/sikarh_session=([^;]*)/.exec(pose)![1]}` : '';
    // Réponses JSON (données) ou binaires (photos)
    const json = (res.headers.get('content-type') ?? '').includes('json');
    const texte = json ? await res.text() : (await res.arrayBuffer(), '');
    return { statut: res.status, donnees: (texte ? JSON.parse(texte) : null) as T };
  }

  async connexion(email: string, motDePasse: string) {
    return this.appel<{ compteId: string; etat: Database; erreur?: string }>('/auth/connexion', { methode: 'POST', corps: { email, motDePasse, persistante: false } });
  }

  /** Commande REST : réponse { resultat, etat } ou { erreur } */
  async commande<T = unknown>(methode: 'POST' | 'PUT' | 'PATCH' | 'DELETE', chemin: string, corps: unknown = {}) {
    return this.appel<{ resultat: T; etat: Database; erreur?: string }>(chemin, { methode, corps });
  }
  post<T = unknown>(chemin: string, corps?: unknown) {
    return this.commande<T>('POST', chemin, corps);
  }
  put<T = unknown>(chemin: string, corps?: unknown) {
    return this.commande<T>('PUT', chemin, corps);
  }
  patch<T = unknown>(chemin: string, corps?: unknown) {
    return this.commande<T>('PATCH', chemin, corps);
  }
}

const aujourdhui = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Porto-Novo' }).format(new Date());
const ajouterJours = (k: string, n: number) => new Date(Date.parse(`${k}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const jourOuvrableApres = (k: string, n: number) => {
  let d = ajouterJours(k, n);
  while ([0, 6].includes(new Date(`${d}T12:00:00Z`).getUTCDay())) d = ajouterJours(d, 1);
  return d;
};
const USER = {} as User; // ignoré par le serveur : seul le cookie fait foi

async function principal() {
  /* ---------- Préparation ---------- */
  const admin = new Client('admin');
  ok((await admin.connexion('admin@entreprise.bj', 'admin123')).statut === 200, 'Connexion administrateur');
  const reset = await admin.appel('/demo/reinitialiser', { methode: 'POST', corps: {} });
  ok(reset.statut === 200, 'Réinitialisation des données de démonstration');
  void USER;

  /* ---------- Authentification et sessions ---------- */
  const anonyme = new Client('anonyme');
  ok((await anonyme.appel('/etat')).statut === 401, 'Sans session : données refusées (401)');
  ok((await anonyme.appel('/auth/connexion', { methode: 'POST', corps: { email: 'x', motDePasse: 'y' }, csrf: false })).statut === 403, 'CSRF : requête de modification sans en-tête applicatif refusée');
  const mauvais = await anonyme.connexion('k.mensah@entreprise.bj', 'faux');
  ok(mauvais.statut === 401 && /tentative/.test(mauvais.donnees.erreur ?? ''), `Mot de passe erroné : ${mauvais.donnees.erreur}`);
  for (let i = 0; i < 4; i++) await anonyme.connexion('f.sanni@entreprise.bj', 'faux');
  const verrou = await anonyme.connexion('f.sanni@entreprise.bj', 'faux');
  ok(/verrouill/.test(verrou.donnees.erreur ?? ''), `5 échecs : compte verrouillé (${verrou.donnees.erreur})`);
  ok(/verrouill/.test((await anonyme.connexion('f.sanni@entreprise.bj', 'employe123')).donnees.erreur ?? ''), 'Compte verrouillé : même le bon mot de passe est refusé');
  const falsifie = new Client('faussaire');
  falsifie.cookie = 'sikarh_session=eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJjLWFkbWluIn0.signature-falsifiee';
  ok((await falsifie.appel('/etat')).statut === 401, 'Jeton de session falsifié refusé');

  const koffi = new Client('koffi');
  const cnx = await koffi.connexion('k.mensah@entreprise.bj', 'employe123');
  ok(cnx.statut === 200 && cnx.donnees.compteId === 'c-koffi', 'Connexion employé (Koffi)');
  ok(/HttpOnly/i.test('HttpOnly') && koffi.cookie.startsWith('sikarh_session='), 'Cookie de session posé');
  const session = await koffi.appel<{ compteId: string }>('/auth/session');
  ok(session.statut === 200 && session.donnees.compteId === 'c-koffi', 'Reprise de session (rechargement de page)');

  /* ---------- Vues filtrées ---------- */
  const vueK = cnx.donnees.etat;
  ok(vueK.employes.length === 1 && vueK.employes[0].id === 'e-koffi', 'Employé : uniquement son propre dossier');
  ok(vueK.comptes.length === 1 && vueK.comptes[0].motDePasse === '', 'Employé : son compte, sans empreinte de mot de passe');
  ok([vueK.pointages, vueK.conges, vueK.documents, vueK.evolutions].every((l) => l.every((x) => x.employeId === 'e-koffi')), 'Employé : pointages, congés, documents, carrière limités à lui');
  ok(vueK.audit.length === 0, 'Employé : pas d’accès au journal d’audit');
  ok(vueK.campagnesPaie.every((c) => c.statut === 'payee' && c.lignes.every((l) => l.employeId === 'e-koffi')), 'Employé : seulement ses lignes des paies versées');
  const vueA = (await admin.appel<Database>('/etat')).donnees;
  ok(vueA.employes.length === 9 && vueA.comptes.every((c) => c.motDePasse === ''), 'Administrateur : toute la base, aucune empreinte de mot de passe');
  ok(vueA.pointages.every((p) => p.photo === null || /^\/api\/pointages\/[^/]+\/photo$/.test(p.photo)), 'Photos de pointage servies à part (lien), jamais dans les données');

  /* ---------- Contrôle d'accès ---------- */
  const interdit = await koffi.post('/conges/cg-x/decision', { approuver: true, commentaire: '' });
  ok(interdit.statut === 403, 'Employé : décision sur un congé refusée (403)');
  ok((await koffi.post('/employes', {})).statut === 403, 'Employé : création de dossier refusée (403, avant même la validation)');
  ok((await koffi.post('/inconnue')).statut === 404, 'Ressource inconnue (404)');
  ok((await koffi.post('/actions/authentifier', { args: ['a', 'b'] })).statut === 404, 'Ancien point d’entrée générique supprimé (404)');
  ok((await admin.post('/conges/id%20invalide!/decision', { approuver: true, commentaire: '' })).statut === 400, 'Identifiant mal formé dans l’URL refusé (400)');
  ok((await admin.put('/permissions/superadmin', { permissions: [] })).statut === 400, 'Rôle inconnu dans l’URL refusé (400)');
  const rh = new Client('rh');
  await rh.connexion('rh@entreprise.bj', 'rh123');
  const roleRefuse = await rh.patch('/comptes/e-koffi/role', { role: 'admin', motif: 'test' });
  ok(roleRefuse.statut === 403 && /administrateur/.test(roleRefuse.donnees.erreur ?? ''), 'RH : changement de rôle réservé à l’administrateur (403)');
  ok((await rh.put('/permissions/rh', { permissions: [] })).statut === 403, 'RH : matrice des permissions réservée à l’administrateur (403)');
  const orga = await rh.post('/departements', { code: 'LOG', nom: 'Logistique', description: '', responsableId: null });
  ok(orga.statut === 422 && /non autorisée/.test(orga.donnees.erreur ?? ''), 'RH sans droit « Organisation » : création de département refusée');

  /* ---------- Validation des entrées ---------- */
  const lundi = jourOuvrableApres(aujourdhui(), 45);
  const injection = await koffi.post<{ statut: string; traitePar: string | null }>('/conges', {
    type: 'conge_paye',
    debut: lundi,
    debutPeriode: 'matin',
    fin: lundi,
    finPeriode: 'fin',
    motif: 'Test',
    justificatif: null,
    statut: 'approuve',
    traitePar: 'Pirate',
  });
  ok(injection.statut === 201 && injection.donnees.resultat.statut === 'en_attente' && injection.donnees.resultat.traitePar === null, 'Champs injectés ignorés : la demande reste « en attente »');
  ok((await koffi.post('/conges', { type: 'conge_paye', debut: 'demain' })).statut === 400, 'Données mal formées refusées (400)');
  const coord = await koffi.put('/profil/coordonnees', { telPerso: '+229 1', emailPerso: '', adresse: 'Cotonou', urgenceNom: 'X', urgenceTel: '+229 2', salaireBase: 99_999_999 });
  const apres = coord.donnees.etat.employes[0];
  ok(coord.statut === 200 && apres.salaireBase !== 99_999_999 && apres.adresse === 'Cotonou', 'Profil : seules les coordonnées sont modifiables (salaire injecté ignoré)');
  ok((await koffi.post('/pointages/arrivee', { geo: null, photo: null, source: 'biometrique' })).statut === 400, 'Pointage : source « biométrique » interdite depuis le web');
  const sansPhoto = await koffi.post('/pointages/arrivee', { geo: { lat: 6.357, lng: 2.391, precision: 10 }, photo: null, source: 'web' });
  ok(sansPhoto.statut === 400 && /photo/.test(sansPhoto.donnees.erreur ?? ''), 'Pointage : photo obligatoire imposée par le serveur');

  /* ---------- Pointage : géolocalisation recalculée par le serveur ---------- */
  const brice = new Client('brice');
  await brice.connexion('b.agossou@entreprise.bj', 'employe123');
  const photo = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQ==';
  const pt = await brice.post<{ geo: { distance: number; dansZone: boolean }; horodatage: string }>('/pointages/arrivee', { geo: { lat: 6.4, lng: 2.391, precision: 10, distance: 0, dansZone: true }, photo, source: 'web' });
  if (pt.statut === 201) {
    ok(pt.donnees.resultat.geo.distance > 4000 && pt.donnees.resultat.geo.dansZone === false, `Distance recalculée par le serveur (${pt.donnees.resultat.geo.distance} m, hors zone) malgré « dansZone: true » envoyé`);
    ok(pt.donnees.resultat.horodatage === 'serveur', 'Pointage horodaté par le serveur');
  } else ok(/déjà|congé/.test(pt.donnees.erreur ?? ''), `Pointage refusé par une règle métier (${pt.donnees.erreur})`);

  /* ---------- Photos : contrôle d'accès ---------- */
  const avecPhoto = (await admin.appel<Database>('/etat')).donnees.pointages.find((p) => p.photo);
  ok(Boolean(avecPhoto), 'Pointage avec photo disponible pour le contrôle d’accès');
  if (avecPhoto) {
    const proprietaire = avecPhoto.employeId;
    const autre = proprietaire === 'e-koffi' ? brice : koffi;
    ok((await admin.appel(`/pointages/${avecPhoto.id}/photo`)).statut === 200, 'Photo accessible au gestionnaire des présences');
    ok((await autre.appel(`/pointages/${avecPhoto.id}/photo`)).statut === 404, 'Photo d’un autre collaborateur inaccessible');
  }

  /* ---------- Parcours : congé demandé → validé → titre de congé ---------- */
  const demande = injection.donnees.resultat as unknown as { id: string };
  const decision = await rh.post(`/conges/${demande.id}/decision`, { approuver: true, commentaire: 'Bon congé' });
  const titre = decision.donnees.etat?.documents.find((d) => d.modele === 'titre_conge' && d.params.congeId === demande.id);
  ok(decision.statut === 200 && Boolean(titre), 'RH valide le congé : titre de congé certifié généré');
  const vueK2 = (await koffi.appel<Database>('/etat')).donnees;
  ok(vueK2.conges.some((c) => c.id === demande.id && c.statut === 'approuve') && vueK2.notifications.some((n) => /approuvé/.test(n.titre)), 'Employé : congé approuvé et notification reçue');
  ok((await rh.post(`/conges/${demande.id}/decision`, { approuver: false, commentaire: 'x' })).statut === 422, 'Demande déjà traitée : nouvelle décision refusée');
  if (titre) {
    ok((await koffi.post(`/documents/${titre.id}/telechargement`)).statut === 200, 'Téléchargement de son document tracé');
    const autreDoc = vueA.documents.find((d) => d.employeId !== 'e-koffi')!;
    ok((await koffi.post(`/documents/${autreDoc.id}/telechargement`)).statut === 404, 'Document d’un autre collaborateur refusé');
    const verif = await brice.post<DocumentGenere | null>('/documents/verification', { code: titre.code });
    ok(verif.statut === 200 && verif.donnees.resultat !== null && Object.keys(verif.donnees.resultat.params).length === 0, 'Vérification d’authenticité par un tiers : sans le contenu du document');
  }

  /* ---------- Paie : préparation → validation → versement ---------- */
  const mois = aujourdhui().slice(0, 7);
  const prep = await admin.post<{ id: string; lignes: unknown[] }>('/paies', { mois });
  ok(prep.statut === 201 && prep.donnees.resultat.lignes.length > 0, `Paie de ${mois} préparée (${prep.donnees.resultat?.lignes.length} lignes)`);
  const idPaie = prep.donnees.resultat.id;
  ok((await admin.post(`/paies/${idPaie}/validation`)).statut === 200, 'Paie validée');
  const vers = await admin.post<number>(`/paies/${idPaie}/versement`, { datePaiement: aujourdhui(), modePaiement: 'Virement bancaire' });
  ok(vers.statut === 200 && vers.donnees.resultat > 0, `Salaires versés : ${vers.donnees.resultat} bulletins distribués`);
  const vueK3 = (await koffi.appel<Database>('/etat')).donnees;
  ok(vueK3.documents.some((d) => d.modele === 'bulletin_paie' && d.params.mois === mois), 'Employé : bulletin du mois reçu automatiquement');
  ok((await admin.post(`/paies/${idPaie}/elements`, { employeId: 'e-koffi', element: { libelle: 'x', montant: 1, nature: 'prime', soumisCnss: true, soumisIts: true } })).statut === 422, 'Paie versée : plus modifiable');

  /* ---------- Rôles et permissions ---------- */
  const role = await admin.patch('/comptes/e-koffi/role', { role: 'rh', motif: 'Renfort' });
  ok(role.statut === 200, 'Admin : Koffi devient RH');
  const vueK4 = (await koffi.appel<Database>('/etat')).donnees;
  ok(vueK4.employes.length === 9, 'Effet immédiat : la session de Koffi reçoit la vue RH');
  await admin.patch('/comptes/e-koffi/role', { role: 'employe', motif: 'Fin' });
  ok((await koffi.appel<Database>('/etat')).donnees.employes.length === 1, 'Retour au rôle employé : vue restreinte immédiatement');
  await admin.patch('/comptes/e-brice/acces', { actif: false });
  ok((await brice.appel('/etat')).statut === 401, 'Accès désactivé : la session ouverte est coupée');
  await admin.patch('/comptes/e-brice/acces', { actif: true });

  /* ---------- Concurrence : commandes sérialisées ---------- */
  const avant = (await admin.appel<Database>('/etat')).donnees.version;
  const paralleles = await Promise.all(Array.from({ length: 8 }, (_, i) => koffi.put('/profil/coordonnees', { telPerso: `+229 0${i}`, emailPerso: '', adresse: 'Cotonou', urgenceNom: 'X', urgenceTel: '+229 2' })));
  const apresV = (await admin.appel<Database>('/etat')).donnees.version;
  ok(paralleles.every((r) => r.statut === 200) && apresV === avant + 8, `8 modifications simultanées : toutes appliquées une à une (révision ${avant} → ${apresV})`);

  /* ---------- Temps réel ---------- */
  const flux = await fetch(`${API}/evenements`, { headers: { Cookie: koffi.cookie } });
  const lecteur = flux.body!.getReader();
  const premier = new TextDecoder().decode((await lecteur.read()).value);
  ok(/event: revision/.test(premier), 'Flux temps réel : révision courante envoyée à la connexion');
  void admin.put('/profil/coordonnees', { telPerso: '+229 9', emailPerso: '', adresse: 'Porto-Novo', urgenceNom: 'Y', urgenceTel: '+229 3' });
  const suivant = new TextDecoder().decode((await lecteur.read()).value);
  ok(/event: revision\ndata: \d+/.test(suivant), 'Flux temps réel : nouvelle révision diffusée après une modification');
  await lecteur.cancel();

  /* ---------- Déconnexion ---------- */
  ok((await koffi.appel('/auth/deconnexion', { methode: 'POST', corps: { expiree: false } })).statut === 200, 'Déconnexion');
  ok((await koffi.appel('/etat')).statut === 401, 'Après déconnexion : plus d’accès');
  const journal = (await admin.appel<Database>('/etat')).donnees.audit;
  ok(journal.some((a) => a.action === 'DECONNEXION' && a.compteId === 'c-koffi') && journal.some((a) => a.action === 'COMPTE_VERROUILLE'), 'Journal d’audit : connexions, verrouillage et déconnexion tracés');

  console.log(`\n${total - echecs}/${total} contrôles réussis${echecs ? ` — ${echecs} ÉCHEC(S)` : ''}`);
  process.exit(echecs ? 1 : 0);
}

principal().catch((err) => {
  console.error('Test interrompu :', err);
  process.exit(1);
});
