/**
 * src/db.js — conexión con Turso (SQLite en la nube)
 * ---------------------------------------------------------------
 * - Producción: TURSO_DATABASE_URL (libsql://...) + TURSO_AUTH_TOKEN.
 * - Local sin variables: usa el archivo data/notas.db (se crea solo).
 * La conexión y la creación de tablas se hacen una sola vez y se reutilizan.
 */
import { mkdirSync } from 'node:fs';
import { createClient } from '@libsql/client';
import { config } from './config.js';
import { crearRepositorio, iniciarEsquema } from './repositorio.js';

let promesa = null;

async function conectar() {
  let url = config.tursoUrl;
  if (!url) {
    if (process.env.VERCEL) {
      throw new Error('Falta la variable TURSO_DATABASE_URL (en Vercel no hay disco persistente).');
    }
    mkdirSync('data', { recursive: true });
    url = 'file:data/notas.db';
  }
  const db = createClient({ url, authToken: config.tursoToken || undefined });
  await iniciarEsquema(db);
  return crearRepositorio(db);
}

/** Repositorio listo para usar. Si falla la conexión, el siguiente intento vuelve a probar. */
export function obtenerRepo() {
  if (!promesa) {
    promesa = conectar().catch((err) => {
      promesa = null;
      throw err;
    });
  }
  return promesa;
}
