/**
 * src/config.js — configuración leída de variables de entorno
 * ---------------------------------------------------------------
 * Todas son opcionales para probar en local (se usa un archivo SQLite).
 * En producción define TURSO_DATABASE_URL y TURSO_AUTH_TOKEN.
 */

const entero = (nombre, defecto) => {
  const v = Number.parseInt(process.env[nombre], 10);
  return Number.isFinite(v) && v > 0 ? v : defecto;
};

const MB = 1024 * 1024;
const maxMediaBytes = entero('MAX_MEDIA_MB', 3) * MB;

export const config = {
  puerto: entero('PORT', 3000),

  // Base de datos (Turso = SQLite en la nube). Sin URL se usa data/notas.db en local.
  tursoUrl: (process.env.TURSO_DATABASE_URL || '').trim(),
  tursoToken: (process.env.TURSO_AUTH_TOKEN || '').trim(),

  // Máximo de bytes de archivos (imagen + adjunto) por petición. Vercel acepta ~4,5 MB por
  // petición y Base64 añade un 33 %, por eso el valor por defecto es 3 MB.
  maxMediaBytes,
  // Tamaño máximo del JSON recibido: Base64 (+33 %) más el texto de la nota.
  limiteJson: Math.ceil((maxMediaBytes * 4) / 3) + 400_000,

  // Límites para que una API abierta no se llene de basura.
  maxNotas: entero('MAX_NOTAS', 1000),
  maxTitulo: 200,
  maxContenido: 100_000,
  limiteLecturas: entero('RATE_LIMIT_READ', 300),     // peticiones por minuto y por IP
  limiteEscrituras: entero('RATE_LIMIT_WRITE', 40),   // crear/editar/borrar por minuto y por IP
};
