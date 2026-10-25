// Contrôle de persistance : l'état servi par l'API doit être identique à la base relue depuis MySQL.
// Usage : avec le serveur démarré, « npx tsx src/scripts/verifier-persistance.ts » (compte administrateur de démonstration).
import { chargerBase } from '../db/depot';
import '../db/modeles';
import { sequelize } from '../db/sequelize';
import { vuePour } from '../services/vues';
import type { Database } from '../types';
import { canonique, differences } from './outils';

const API = process.env.API_URL ?? 'http://localhost:4000/api';
const r = await fetch(`${API}/auth/connexion`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-SikaRH': '1' }, body: JSON.stringify({ email: 'admin@entreprise.bj', motDePasse: 'admin123' }) });
const cookie = /sikarh_session=[^;]*/.exec(r.headers.get('set-cookie') ?? '')![0];
const { compteId } = (await r.json()) as { compteId: string };
const servi = (await (await fetch(`${API}/etat`, { headers: { Cookie: cookie } })).json()) as Database;
const relue = (await chargerBase())!;
const admin = relue.comptes.find((c) => c.id === compteId)!;
const vue = vuePour(relue, { compteId, employeId: admin.employeId, email: admin.email, role: admin.role, prenom: '', nom: '', departement: '', matricule: '', avatarUrl: '' });
const egal = canonique(vue) === canonique(servi);
console.log(egal ? `✔ État servi identique à la base MySQL (révision ${servi.version}, ${servi.pointages.length} pointages, ${servi.audit.length} entrées d'audit)` : `✘ Écart :\n${differences(servi, vue).join('\n')}`);
await sequelize.close();
process.exit(egal ? 0 : 1);
