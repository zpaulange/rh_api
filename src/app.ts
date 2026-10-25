import compression from 'compression';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { config } from './config';
import { gestionErreurs } from './middlewares/erreurs';
import { antiCsrf } from './middlewares/session';
import { routesApi } from './routes';

export function creerApplication() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'same-origin' } }));
  app.use(cors({ origin: config.CORS_ORIGINE.split(',').map((o) => o.trim()), credentials: true, allowedHeaders: ['Content-Type', 'X-SikaRH', 'If-None-Match'] }));
  // Les événements temps réel ne doivent pas être mis en tampon par la compression
  app.use(compression({ filter: (req, res) => !req.path.endsWith('/evenements') && compression.filter(req, res) }));
  // Pointage avec photo : jusqu'à ~3 Mo
  app.use(express.json({ limit: '4mb' }));
  app.use('/api', antiCsrf, routesApi);
  app.use('/api', (_req, res) => {
    res.status(404).json({ erreur: 'Ressource inconnue.' });
  });
  app.use(gestionErreurs);
  return app;
}
