/**
 * src/controladores.js — lógica de cada endpoint
 * ---------------------------------------------------------------
 * Los controladores no dependen de Express (solo usan req.params, req.query,
 * req.body y res.status/json/set/send), lo que permite probarlos sin servidor.
 * Los errores se lanzan como ErrorHTTP y los atiende el manejador central.
 */
import { randomUUID } from 'node:crypto';
import { ErrorHTTP } from './errores.js';
import { validarCuerpo } from './validacion.js';
import { LARGO_RESUMEN } from './repositorio.js';

const ID_VALIDO = /^[A-Za-z0-9-]{8,64}$/;

/** Convierte un parámetro de la URL en entero dentro de [min, max]. */
function entero(valor, defecto, min, max) {
  const n = Number.parseInt(valor, 10);
  if (!Number.isFinite(n)) return defecto;
  return Math.min(max, Math.max(min, n));
}

const urlMedia = (id, tipo) => `/api/notas/${id}/${tipo}`;

/** Información de imagen y adjunto (sin los datos Base64: se descargan por su URL). */
function infoMedia(f) {
  return {
    imagen: f.imagen_tipo ? { tipo: f.imagen_tipo, url: urlMedia(f.id, 'imagen') } : null,
    adjunto: f.adjunto_nombre
      ? { nombre: f.adjunto_nombre, tipo: f.adjunto_tipo, tamano: Number(f.adjunto_tamano), url: urlMedia(f.id, 'adjunto') }
      : null,
  };
}

const base = (f) => ({ id: f.id, titulo: f.titulo, creada: Number(f.creada), actualizada: Number(f.actualizada) });
const aResumen = (f) => ({ ...base(f), resumen: f.resumen, truncado: Number(f.largo) > LARGO_RESUMEN, ...infoMedia(f) });
const aDetalle = (f) => ({ ...base(f), contenido: f.contenido, ...infoMedia(f) });

/** Cabecera Content-Disposition con nombre seguro (ASCII + UTF-8). */
function descarga(nombre) {
  const ascii = nombre.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(nombre)}`;
}

export const DOCUMENTACION = {
  nombre: 'appNotasJ19 API',
  version: '1.0.0',
  descripcion: 'Bloc de notas colaborativo y abierto: sin autenticación. Cualquiera puede ver, crear, editar y eliminar notas.',
  endpoints: [
    { metodo: 'GET', ruta: '/api/salud', descripcion: 'Estado del servidor y de la base de datos.' },
    { metodo: 'GET', ruta: '/api/config', descripcion: 'Límites vigentes (tamaños, longitudes).' },
    { metodo: 'GET', ruta: '/api/notas?q=&limite=&desplazamiento=', descripcion: 'Lista notas (más recientes primero) con resumen. q busca en título y contenido.' },
    { metodo: 'GET', ruta: '/api/notas/:id', descripcion: 'Una nota completa.' },
    { metodo: 'POST', ruta: '/api/notas', descripcion: 'Crea una nota. Cuerpo: { titulo, contenido, imagen?, adjunto? }.' },
    { metodo: 'PUT', ruta: '/api/notas/:id', descripcion: 'Actualiza una nota. Cuerpo: { titulo, contenido, version?, forzar?, imagen?, adjunto? }. Si envías "version" y alguien la cambió, responde 409.' },
    { metodo: 'DELETE', ruta: '/api/notas/:id', descripcion: 'Elimina una nota.' },
    { metodo: 'GET', ruta: '/api/notas/:id/imagen', descripcion: 'Descarga la imagen de la nota.' },
    { metodo: 'GET', ruta: '/api/notas/:id/adjunto', descripcion: 'Descarga el archivo adjunto de la nota.' },
  ],
  archivos: 'imagen y adjunto: { nombre, tipo, datos } con "datos" en Base64 (o Data URL). En PUT: omitir = conservar, null = quitar.',
};

export function crearControladores({ obtenerRepo, config }) {
  const opciones = {
    maxBytes: config.maxMediaBytes,
    maxTitulo: config.maxTitulo,
    maxContenido: config.maxContenido,
  };

  const idDe = (req) => {
    const id = req.params.id;
    if (!ID_VALIDO.test(id || '')) throw new ErrorHTTP(404, 'La nota no existe.');
    return id;
  };

  /** Sirve imagen o adjunto con cabeceras seguras (nunca se ejecuta contenido del usuario). */
  async function servirMedia(req, res, tipo) {
    const repo = await obtenerRepo();
    const m = await repo.media(idDe(req), tipo);
    if (!m) throw new ErrorHTTP(404, tipo === 'imagen' ? 'La nota no tiene imagen.' : 'La nota no tiene archivo adjunto.');
    const buf = Buffer.from(m.datos, 'base64');
    res.set({
      'Content-Type': m.tipo || 'application/octet-stream',
      'Content-Length': String(buf.length),
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; sandbox",
      'Cross-Origin-Resource-Policy': 'cross-origin',
      'Cache-Control': 'public, max-age=3600',
      ...(tipo === 'adjunto' ? { 'Content-Disposition': descarga(m.nombre || 'archivo') } : {}),
    });
    res.status(200).send(buf);
  }

  return {
    documentacion: async (req, res) => { res.json(DOCUMENTACION); },

    salud: async (req, res) => {
      try {
        const notas = await (await obtenerRepo()).contar();
        res.json({ ok: true, notas, version: DOCUMENTACION.version });
      } catch (err) {
        console.error(err);
        res.status(503).json({ ok: false, error: `No se pudo conectar con la base de datos: ${err.message}` });
      }
    },

    configuracion: async (req, res) => {
      res.json({
        maxMediaBytes: config.maxMediaBytes,
        maxTitulo: config.maxTitulo,
        maxContenido: config.maxContenido,
        maxNotas: config.maxNotas,
        resumen: LARGO_RESUMEN,
      });
    },

    listar: async (req, res) => {
      const q = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 100) : '';
      const limite = entero(req.query.limite, 50, 1, 500);
      const desplazamiento = entero(req.query.desplazamiento, 0, 0, 1_000_000);
      const { total, notas } = await (await obtenerRepo()).listar({ q, limite, desplazamiento });
      res.json({ total, notas: notas.map(aResumen) });
    },

    obtener: async (req, res) => {
      const f = await (await obtenerRepo()).obtener(idDe(req));
      if (!f) throw new ErrorHTTP(404, 'La nota no existe.');
      res.json(aDetalle(f));
    },

    crear: async (req, res) => {
      const repo = await obtenerRepo();
      const datos = validarCuerpo(req.body, { ...opciones, creacion: true });
      if ((await repo.contar()) >= config.maxNotas) {
        throw new ErrorHTTP(403, `Se alcanzó el máximo de ${config.maxNotas} notas. Elimina alguna para crear otra.`);
      }
      const id = randomUUID();
      await repo.crear({ id, ...datos });
      res.status(201).json(aDetalle(await repo.obtener(id)));
    },

    actualizar: async (req, res) => {
      const repo = await obtenerRepo();
      const id = idDe(req);
      const datos = validarCuerpo(req.body, { ...opciones, creacion: false });

      if ((await repo.actualizar(id, datos)) === 0) {
        const actual = await repo.obtener(id);
        if (!actual) throw new ErrorHTTP(404, 'La nota ya no existe: alguien la eliminó.');
        throw new ErrorHTTP(409, 'Otra persona modificó esta nota mientras la editabas.', { codigo: 'conflicto', nota: aDetalle(actual) });
      }
      res.json(aDetalle(await repo.obtener(id)));
    },

    eliminar: async (req, res) => {
      const id = idDe(req);
      if ((await (await obtenerRepo()).eliminar(id)) === 0) throw new ErrorHTTP(404, 'La nota no existe.');
      res.json({ ok: true, id });
    },

    imagen: (req, res) => servirMedia(req, res, 'imagen'),
    adjunto: (req, res) => servirMedia(req, res, 'adjunto'),
  };
}
