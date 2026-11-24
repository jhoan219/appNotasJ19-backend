/**
 * src/validacion.js — validación y normalización de lo que llega del cliente
 * ---------------------------------------------------------------
 * La API es abierta, así que nada de lo recibido se da por bueno: se comprueban
 * tamaños, se verifica que las imágenes lo sean de verdad (por sus primeros
 * bytes, no por lo que diga el cliente) y se limpian los nombres de archivo.
 */
import { ErrorHTTP } from './errores.js';

const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;
const TIPO_MIME = /^[a-z0-9][\w.+-]*\/[a-z0-9][\w.+-]*$/i;
const mb = (bytes) => Math.round((bytes / 1024 / 1024) * 10) / 10;

/** Devuelve el tipo real de una imagen (PNG, JPG, GIF o WEBP) o null. SVG se rechaza a propósito (puede llevar scripts). */
export function detectarImagen(buf) {
  if (buf.length >= 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'image/png';
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.length >= 6 && buf.toString('latin1', 0, 4) === 'GIF8') return 'image/gif';
  if (buf.length >= 12 && buf.toString('latin1', 0, 4) === 'RIFF' && buf.toString('latin1', 8, 12) === 'WEBP') return 'image/webp';
  return null;
}

/** Nombre de archivo seguro: sin rutas, sin caracteres de control ni comillas. */
export function limpiarNombre(nombre) {
  const limpio = String(nombre ?? '')
    .replace(/[\\/]/g, '_')
    .replace(/[\u0000-\u001f\u007f"<>:|?*]/g, '')
    .trim()
    .slice(0, 150);
  return limpio || 'archivo';
}

/** Decodifica un campo `datos` en Base64 (acepta Data URL) y comprueba su tamaño. */
function decodificar(campo, valor, maxBytes) {
  if (typeof valor !== 'object' || typeof valor.datos !== 'string') {
    throw new ErrorHTTP(400, `"${campo}" debe ser un objeto con "datos" en Base64 (o null para quitarlo).`);
  }
  const limpio = valor.datos.replace(/^data:[^;,]*;base64,/i, '').replace(/\s+/g, '');
  if (!limpio || !BASE64.test(limpio) || limpio.length % 4 === 1) {
    throw new ErrorHTTP(400, `"${campo}.datos" no es Base64 válido.`);
  }
  const buf = Buffer.from(limpio, 'base64');
  if (buf.length === 0) throw new ErrorHTTP(400, `"${campo}" está vacío.`);
  if (buf.length > maxBytes) throw new ErrorHTTP(413, `El archivo supera el máximo de ${mb(maxBytes)} MB.`);
  return { buf, datos: buf.toString('base64') };
}

/** undefined = no tocar · null = quitar · objeto = reemplazar. */
function normalizarImagen(valor, maxBytes) {
  if (valor === undefined || valor === null) return valor;
  const { buf, datos } = decodificar('imagen', valor, maxBytes);
  const tipo = detectarImagen(buf);
  if (!tipo) throw new ErrorHTTP(400, 'La imagen debe ser PNG, JPG, GIF o WEBP.');
  return { tipo, tamano: buf.length, datos };
}

function normalizarAdjunto(valor, maxBytes) {
  if (valor === undefined || valor === null) return valor;
  const { buf, datos } = decodificar('adjunto', valor, maxBytes);
  const tipo = typeof valor.tipo === 'string' && TIPO_MIME.test(valor.tipo) ? valor.tipo.toLowerCase() : 'application/octet-stream';
  return { nombre: limpiarNombre(valor.nombre), tipo, tamano: buf.length, datos };
}

/**
 * Valida el cuerpo de POST / PUT.
 * Devuelve { titulo, contenido, imagen, adjunto, version, forzar }.
 */
export function validarCuerpo(cuerpo, { maxBytes, maxTitulo, maxContenido, creacion }) {
  if (!cuerpo || typeof cuerpo !== 'object' || Array.isArray(cuerpo)) {
    throw new ErrorHTTP(400, 'El cuerpo debe ser un objeto JSON.');
  }
  const titulo = cuerpo.titulo ?? '';
  const contenido = cuerpo.contenido ?? '';
  if (typeof titulo !== 'string' || typeof contenido !== 'string') {
    throw new ErrorHTTP(400, '"titulo" y "contenido" deben ser texto.');
  }
  if (titulo.length > maxTitulo) throw new ErrorHTTP(400, `El título no puede superar ${maxTitulo} caracteres.`);
  if (contenido.length > maxContenido) throw new ErrorHTTP(400, `El contenido no puede superar ${maxContenido} caracteres.`);

  const imagen = normalizarImagen(cuerpo.imagen, maxBytes);
  const adjunto = normalizarAdjunto(cuerpo.adjunto, maxBytes);
  const total = (imagen ? imagen.tamano : 0) + (adjunto ? adjunto.tamano : 0);
  if (total > maxBytes) {
    throw new ErrorHTTP(413, `Entre imagen y adjunto no puedes superar ${mb(maxBytes)} MB por guardado.`);
  }

  let version;
  if (cuerpo.version !== undefined && cuerpo.version !== null) {
    if (!Number.isInteger(cuerpo.version)) throw new ErrorHTTP(400, '"version" debe ser un número entero.');
    version = cuerpo.version;
  }

  if (creacion && !titulo.trim() && !contenido.trim() && !imagen && !adjunto) {
    throw new ErrorHTTP(400, 'La nota está vacía: agrega un título, texto, imagen o archivo.');
  }

  return { titulo: titulo.trim(), contenido, imagen, adjunto, version, forzar: cuerpo.forzar === true };
}
