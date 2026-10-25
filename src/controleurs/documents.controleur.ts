import type { Request, Response } from 'express';
import type { DocumentGenere } from '../types';
import * as documentsService from '../services/documents.service';
import { executer, lire } from '../services/commandes';
import { ErreurIntrouvable } from '../services/erreurs';

const gestion = (role: string) => role === 'rh' || role === 'admin';

/** POST /api/demandes-documents — demande du collaborateur connecté */
export const demander = (req: Request, res: Response) => executer(req, res, (user) => documentsService.demanderDocument(user, req.body), 201);

/** POST /api/demandes-documents/:id/traitement — génération du document certifié */
export const traiter = (req: Request, res: Response) => executer(req, res, (user) => documentsService.traiterDemandeDocument(user, req.params.id as string));

/** POST /api/demandes-documents/:id/refus */
export const refuser = (req: Request, res: Response) => executer(req, res, (user) => documentsService.refuserDemandeDocument(user, req.params.id as string, req.body.motif));

/** POST /api/documents — génération directe par le service RH */
export const generer = (req: Request, res: Response) => executer(req, res, (user) => documentsService.genererDocumentManuel(user, req.body.employeId, req.body.modele, req.body.params), 201);

/** POST /api/documents/:id/telechargement — trace du téléchargement (son document, ou gestion) */
export const telechargement = (req: Request, res: Response) =>
  executer(req, res, (user) => {
    const doc = lire().documents.find((x) => x.id === req.params.id);
    if (!doc || (doc.employeId !== user.employeId && !gestion(user.role))) throw new ErreurIntrouvable('Document introuvable.');
    return documentsService.journaliserTelechargement(user, doc);
  });

/** POST /api/documents/verification — authenticité d'un code ; le contenu d'un document d'autrui n'est pas divulgué */
export const verifier = (req: Request, res: Response) =>
  executer(req, res, (user) => {
    const doc = documentsService.verifierDocument(user, req.body.code);
    if (doc && !gestion(user.role) && doc.employeId !== user.employeId) return { ...doc, params: {} } satisfies DocumentGenere;
    return doc;
  });
