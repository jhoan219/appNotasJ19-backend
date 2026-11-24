/**
 * src/app.js — aplicación Express (sin arrancar el servidor)
 * ---------------------------------------------------------------
 * La usan tanto server.js (local / Render) como api/index.js (Vercel).
 */
import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { config } from './config.js';
import { obtenerRepo } from './db.js';
import { crearControladores } from './controladores.js';
import { registrarRutas } from './rutas.js';
import { manejadorErrores } from './errores.js';

export function crearApp() {
  const app = express();
  app.set('trust proxy', 1);          // detrás de Vercel/Render: toma la IP real del visitante
  app.disable('x-powered-by');

  // CORS abierto: cualquier frontend puede usar la API (no hay cookies ni sesiones).
  app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type'],
    exposedHeaders: ['Content-Disposition'],
    maxAge: 86400,
  }));

  // Límites por IP para que una API abierta no se sature. Se registran después de CORS
  // para que incluso el error 429 llegue al navegador con sus cabeceras CORS.
  const limitador = (limit, saltar) => rateLimit({
    windowMs: 60_000,
    limit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    skip: saltar,
    message: { error: 'Demasiadas peticiones. Espera un momento e inténtalo de nuevo.' },
  });
  app.use('/api', limitador(config.limiteLecturas, (req) => req.method === 'OPTIONS'));
  app.use('/api/notas', limitador(config.limiteEscrituras, (req) => !['POST', 'PUT', 'DELETE'].includes(req.method)));

  app.use(express.json({ limit: config.limiteJson }));

  registrarRutas(app, crearControladores({ obtenerRepo, config }));

  app.use((req, res) => {
    res.status(404).json({ error: 'Ruta no encontrada. Consulta GET /api para ver los endpoints.' });
  });
  app.use(manejadorErrores);
  return app;
}

export default crearApp();
