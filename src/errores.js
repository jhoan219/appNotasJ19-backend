/**
 * src/errores.js — errores HTTP y manejador central
 */

/** Error con código HTTP; `extra` se añade al JSON de respuesta. */
export class ErrorHTTP extends Error {
  constructor(estado, mensaje, extra = {}) {
    super(mensaje);
    this.estado = estado;
    this.extra = extra;
  }
}

/** Middleware final de Express: convierte cualquier error en una respuesta JSON limpia. */
export function manejadorErrores(err, req, res, next) {
  if (res.headersSent) return next(err);

  if (err instanceof ErrorHTTP) {
    return res.status(err.estado).json({ error: err.message, ...err.extra });
  }
  // Errores del lector de JSON de Express (body-parser)
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ error: 'La nota es demasiado grande. Reduce el tamaño de la imagen o del archivo.' });
  }
  if (err.type === 'entity.parse.failed' || (err instanceof SyntaxError && 'body' in err)) {
    return res.status(400).json({ error: 'El cuerpo de la petición no es un JSON válido.' });
  }

  console.error(err);   // el detalle queda en los logs; al cliente no se le revela
  return res.status(500).json({ error: 'Error interno del servidor.' });
}
