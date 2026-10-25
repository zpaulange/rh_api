import { calculerRetard } from '../metier/regles';
import { serverNow, timeSource } from '../metier/horloge';
import { dateKey, heureHM } from '../metier/temps';
import type { GeoPoint, Pointage, SourcePointage, User } from '../types';
import { mutate, uid } from './noyau';
import { SYSTEME, acteurDe, employe, journaliser, nomComplet, notifier } from './commun';

/* ================= Pointage ================= */

interface DonneesPointage {
  geo: GeoPoint | null;
  photo: string | null;
  source: SourcePointage;
}

export const TERMINAUX: Record<SourcePointage, string> = {
  biometrique: 'Biométrique (RDC)',
  web: 'Portail Web',
  mobile: 'Mobile (GPS)',
  regularisation: 'Portail Web (Régul.)',
};

export function pointerArrivee(user: User, { geo, photo, source }: DonneesPointage): Pointage {
  return mutate((db) => {
    const now = serverNow();
    const key = dateKey(now);
    if (db.pointages.some((p) => p.employeId === user.employeId && p.date === key)) throw new Error("Vous avez déjà pointé votre arrivée aujourd'hui.");
    const acteur = acteurDe(user);
    const emp = employe(db, user.employeId);
    const arrivee = now.toISOString();
    const retard = calculerRetard(arrivee, db.parametres);
    const p: Pointage = {
      id: uid('pt'),
      employeId: user.employeId,
      date: key,
      arrivee,
      depart: null,
      pauseMinutes: 0,
      pauseDebut: null,
      source,
      terminal: TERMINAUX[source],
      retardMinutes: retard,
      geo,
      geoDepart: null,
      photo,
      horodatage: timeSource(),
    };
    db.pointages.push(p);

    const lieu = geo ? `${geo.dansZone ? 'dans la zone' : 'HORS ZONE'} (${geo.distance} m, ±${geo.precision} m)` : 'non localisé';
    journaliser(db, acteur, 'POINTAGE_ARRIVEE', heureHM(arrivee), emp.id, `Heure ${p.horodatage} • ${lieu} • photo ${photo ? 'oui' : 'non'}`);

    // Détection automatique des retards
    if (retard > db.parametres.toleranceRetard) {
      journaliser(db, SYSTEME, 'RETARD_DETECTE', nomComplet(emp), emp.id, `Arrivée ${heureHM(arrivee)} • ${retard} min de retard`);
      notifier(db, {
        pour: { role: 'rh' },
        titre: 'Retard détecté',
        message: `${nomComplet(emp)} — arrivée ${heureHM(arrivee)} (${retard} min)`,
        lien: '/rh/pointages',
        niveau: 'alerte',
      });
      notifier(db, {
        pour: { employeId: emp.id },
        titre: 'Retard enregistré',
        message: `Arrivée à ${heureHM(arrivee)} (${retard} min). Vous pouvez le justifier via une régularisation.`,
        lien: '/employe/pointages',
        niveau: 'alerte',
      });
    }
    if (geo && !geo.dansZone) {
      journaliser(db, SYSTEME, 'POINTAGE_HORS_ZONE', nomComplet(emp), emp.id, `Distance du site : ${geo.distance} m`);
      notifier(db, {
        pour: { role: 'rh' },
        titre: 'Pointage hors zone',
        message: `${nomComplet(emp)} a pointé à ${geo.distance} m du site`,
        lien: '/rh/pointages',
        niveau: 'alerte',
      });
    }
    return { ...p };
  });
}

export function basculerPause(user: User): void {
  mutate((db) => {
    const now = serverNow();
    const p = db.pointages.find((x) => x.employeId === user.employeId && x.date === dateKey(now));
    if (!p || p.depart) throw new Error('Aucune session active.');
    if (p.pauseDebut) {
      const minutes = Math.round((now.getTime() - new Date(p.pauseDebut).getTime()) / 60000);
      p.pauseMinutes += minutes;
      p.pauseDebut = null;
      journaliser(db, acteurDe(user), 'POINTAGE_PAUSE', 'Reprise', user.employeId, `Pause de ${minutes} min`);
    } else {
      p.pauseDebut = now.toISOString();
      journaliser(db, acteurDe(user), 'POINTAGE_PAUSE', 'Début de pause', user.employeId, heureHM(now));
    }
  });
}

export function pointerDepart(user: User, geo: GeoPoint | null): void {
  mutate((db) => {
    const now = serverNow();
    const p = db.pointages.find((x) => x.employeId === user.employeId && x.date === dateKey(now));
    if (!p || p.depart) throw new Error('Aucune session active.');
    if (p.pauseDebut) {
      p.pauseMinutes += Math.round((now.getTime() - new Date(p.pauseDebut).getTime()) / 60000);
      p.pauseDebut = null;
    }
    p.depart = now.toISOString();
    p.geoDepart = geo;
    journaliser(db, acteurDe(user), 'POINTAGE_DEPART', heureHM(now), user.employeId, geo ? `${geo.distance} m du site` : 'non localisé');
  });
}
