import type { Request, Response } from 'express';
import * as sortiesService from '../services/sorties.service';
import * as employesService from '../services/employes.service';
import * as carriereService from '../services/carriere.service';
import { executer } from '../services/commandes';

// Dossiers des collaborateurs, carrière, sortie

/** POST /api/employes — dossier et compte d'accès (mot de passe temporaire renvoyé une seule fois) */
export const creer = (req: Request, res: Response) => executer(req, res, (user) => employesService.creerEmploye(user, req.body.donnees, req.body.role), 201);

/** PATCH /api/employes/:id */
export const modifier = (req: Request, res: Response) => executer(req, res, (user) => employesService.modifierEmploye(user, req.params.id as string, req.body));

/** DELETE /api/employes/:id — uniquement un dossier sans historique */
export const supprimer = (req: Request, res: Response) => executer(req, res, (user) => employesService.supprimerEmploye(user, req.params.id as string, req.body.motif));

/** POST /api/employes/:id/consultation-donnees-sensibles — trace de la consultation */
export const consulterDonneesSensibles = (req: Request, res: Response) => executer(req, res, (user) => employesService.consulterDonneesSensibles(user, req.params.id as string));

/** POST /api/employes/:id/evolutions — promotion, augmentation, mutation, reclassement */
export const enregistrerEvolution = (req: Request, res: Response) => executer(req, res, (user) => carriereService.enregistrerEvolution(user, req.params.id as string, req.body), 201);

/** POST /api/employes/:id/sortie */
export const enregistrerSortie = (req: Request, res: Response) => executer(req, res, (user) => sortiesService.enregistrerSortie(user, req.params.id as string, req.body), 201);

/** POST /api/sorties/:id/annulation */
export const annulerSortie = (req: Request, res: Response) => executer(req, res, (user) => sortiesService.annulerSortie(user, req.params.id as string, req.body.motif));

/** PUT /api/profil/coordonnees — coordonnées personnelles du collaborateur connecté */
export const modifierCoordonnees = (req: Request, res: Response) => executer(req, res, (user) => employesService.modifierCoordonnees(user, req.body));
