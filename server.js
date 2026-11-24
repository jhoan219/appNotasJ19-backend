/**
 * server.js — arranque para local y para servidores tradicionales (Render, Railway, VPS…)
 * Carga primero las variables de .env (si existe) y después inicia Express.
 */
import 'dotenv/config';
import app from './src/app.js';
import { config } from './src/config.js';

app.listen(config.puerto, () => {
  console.log(`appNotasJ19 API escuchando en http://localhost:${config.puerto}`);
  console.log(config.tursoUrl
    ? 'Base de datos: Turso (nube)'
    : 'Base de datos: archivo local data/notas.db (define TURSO_DATABASE_URL para usar la nube)');
});
