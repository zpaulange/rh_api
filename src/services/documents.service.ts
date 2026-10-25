import { LIBELLE_DEMANDE_DOCUMENT, MODELES_MENSUELS } from '../metier/documents';
import { lignePayee } from '../metier/paie';
import { serverNow, serverNowISO } from '../metier/horloge';
import { ajouterJours, dateKey, moisDe, moisLong } from '../metier/temps';
import type { DemandeDocument, DocumentGenere, ModeleDocument, User } from '../types';
import { getDB, mutate, uid } from './noyau';
import { acteurDe, creerDocument, employe, exiger, journaliser, nomComplet, notifier } from './commun';

/* ================= Documents ================= */

export type NouvelleDemandeDocument = Pick<DemandeDocument, 'type' | 'destinataire' | 'format' | 'commentaire' | 'mois'>;

export function demanderDocument(user: User, d: NouvelleDemandeDocument): DemandeDocument {
  return mutate((db) => {
    const emp = employe(db, user.employeId);
    const prefixe = d.type === 'attestation_salaire' ? 'AT-SAL' : d.type === 'duplicata_paie' ? 'PAIE-DUP' : d.type === 'certificat_presence' ? 'CP-PRE' : 'AT-EMP';
    const dd: DemandeDocument = {
      id: uid('dd'),
      reference: `${prefixe}-${900 + db.demandesDocuments.length}`,
      employeId: emp.id,
      ...d,
      statut: 'en_attente',
      dateDemande: serverNowISO(),
      traitePar: null,
      dateTraitement: null,
      documentId: null,
      commentaireRH: '',
    };
    db.demandesDocuments.push(dd);
    journaliser(db, acteurDe(user), 'DEMANDE_DOCUMENT', dd.reference, emp.id, `${LIBELLE_DEMANDE_DOCUMENT[d.type]} • ${d.destinataire}`);
    notifier(db, {
      pour: { role: 'rh' },
      titre: 'Demande de document',
      message: `${nomComplet(emp)} — ${LIBELLE_DEMANDE_DOCUMENT[d.type]}${d.format === 'paper' ? ' (papier)' : ''}`,
      lien: '/rh/documents',
      niveau: 'info',
    });
    return { ...dd };
  });
}

/** Mois de référence par défaut : le dernier mois complet */
export const moisReference = (): string => moisDe(ajouterJours(`${moisDe(dateKey(serverNow()))}-01`, -1));

export function traiterDemandeDocument(user: User, id: string): DocumentGenere {
  return mutate((db) => {
    exiger(db, user, 'documents.gerer');
    const dd = db.demandesDocuments.find((x) => x.id === id);
    if (!dd || dd.statut !== 'en_attente') throw new Error('Demande déjà traitée.');
    const acteur = acteurDe(user);
    const emp = employe(db, dd.employeId);
    const params: Record<string, string> = { destinataire: dd.destinataire, demande: dd.reference };
    if (MODELES_MENSUELS.includes(dd.type)) params.mois = dd.mois ?? moisReference();
    if (dd.type === 'duplicata_paie' && !lignePayee(db, emp.id, params.mois))
      throw new Error(`Aucun salaire versé à ${nomComplet(emp)} pour ${moisLong(params.mois)} : refusez la demande ou attendez le paiement de ce mois.`);
    const doc = creerDocument(db, emp, dd.type, params, acteur);
    dd.statut = 'pret';
    dd.traitePar = acteur.nom;
    dd.dateTraitement = doc.date;
    dd.documentId = doc.id;
    notifier(db, {
      pour: { employeId: emp.id },
      titre: `${LIBELLE_DEMANDE_DOCUMENT[dd.type]} prête`,
      message: dd.format === 'paper' ? 'Exemplaire papier signé à retirer au service RH' : 'Disponible dans votre coffre-fort numérique',
      lien: '/employe/documents',
      niveau: 'succes',
    });
    return { ...doc };
  });
}

export function refuserDemandeDocument(user: User, id: string, motif: string): void {
  mutate((db) => {
    exiger(db, user, 'documents.gerer');
    const dd = db.demandesDocuments.find((x) => x.id === id);
    if (!dd || dd.statut !== 'en_attente') throw new Error('Demande déjà traitée.');
    const acteur = acteurDe(user);
    dd.statut = 'refuse';
    dd.traitePar = acteur.nom;
    dd.dateTraitement = serverNowISO();
    dd.commentaireRH = motif;
    journaliser(db, acteur, 'REFUS_DOCUMENT', dd.reference, dd.employeId, motif);
    notifier(db, {
      pour: { employeId: dd.employeId },
      titre: 'Demande de document refusée',
      message: motif || LIBELLE_DEMANDE_DOCUMENT[dd.type],
      lien: '/employe/documents',
      niveau: 'alerte',
    });
  });
}

export function genererDocumentManuel(user: User, employeId: string, modele: ModeleDocument, params: Record<string, string>): DocumentGenere {
  return mutate((db) => {
    exiger(db, user, 'documents.gerer');
    const emp = employe(db, employeId);
    const doc = creerDocument(db, emp, modele, params, acteurDe(user));
    notifier(db, {
      pour: { employeId: emp.id },
      titre: 'Nouveau document disponible',
      message: doc.titre,
      lien: '/employe/documents',
      niveau: 'info',
    });
    return { ...doc };
  });
}

export function journaliserTelechargement(user: User, doc: DocumentGenere): void {
  mutate((db) => journaliser(db, acteurDe(user), 'TELECHARGEMENT_DOCUMENT', doc.reference, doc.employeId, doc.titre));
}

/** Vérifie un document par son code (SIKA-XXXX-XXXX), sa référence ou un préfixe d'empreinte */
export function verifierDocument(user: User, saisie: string): DocumentGenere | null {
  const q = saisie.trim().toLowerCase();
  if (!q) return null;
  const doc =
    getDB().documents.find(
      (d) => d.code.toLowerCase() === q || d.reference.toLowerCase() === q || (q.length >= 8 && d.empreinte.startsWith(q)),
    ) ?? null;
  mutate((db) =>
    journaliser(db, acteurDe(user), 'VERIFICATION_DOCUMENT', saisie.trim(), doc?.employeId ?? null, doc ? `Authentique • ${doc.reference}` : 'Aucun document correspondant'),
  );
  return doc;
}
