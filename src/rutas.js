/**
 * src/rutas.js — tabla de rutas de la API
 * ---------------------------------------------------------------
 * Solo usa app.get/post/put/delete, así que es independiente del framework.
 * Cada controlador asíncrono se envuelve para que sus errores lleguen al
 * manejador central (Express 4 no captura promesas rechazadas por sí solo).
 */
export function registrarRutas(app, c) {
  const a = (fn) => (req, res, next) => Promise.resolve(fn(req, res)).catch(next);

  app.get('/', a(c.documentacion));
  app.get('/api', a(c.documentacion));
  app.get('/api/salud', a(c.salud));
  app.get('/api/config', a(c.configuracion));

  app.get('/api/notas', a(c.listar));
  app.post('/api/notas', a(c.crear));
  app.get('/api/notas/:id', a(c.obtener));
  app.put('/api/notas/:id', a(c.actualizar));
  app.delete('/api/notas/:id', a(c.eliminar));

  app.get('/api/notas/:id/imagen', a(c.imagen));
  app.get('/api/notas/:id/adjunto', a(c.adjunto));
}
