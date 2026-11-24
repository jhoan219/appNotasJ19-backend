/**
 * src/repositorio.js — acceso a SQLite (Turso/libSQL)
 * ---------------------------------------------------------------
 * Toda la SQL vive aquí. Recibe un cliente con la forma de @libsql/client:
 *   db.execute({ sql, args }) -> { rows, rowsAffected }
 * Las imágenes y adjuntos se guardan como texto Base64 en la propia fila.
 * Los listados NUNCA cargan esas columnas pesadas.
 */

export const ESQUEMA = [
  `CREATE TABLE IF NOT EXISTS notas (
    id             TEXT PRIMARY KEY,
    titulo         TEXT    NOT NULL DEFAULT '',
    contenido      TEXT    NOT NULL DEFAULT '',
    imagen_tipo    TEXT,
    imagen_datos   TEXT,
    adjunto_nombre TEXT,
    adjunto_tipo   TEXT,
    adjunto_tamano INTEGER,
    adjunto_datos  TEXT,
    creada         INTEGER NOT NULL,
    actualizada    INTEGER NOT NULL
  )`,
  'CREATE INDEX IF NOT EXISTS idx_notas_actualizada ON notas (actualizada DESC)',
];

export const LARGO_RESUMEN = 300;

/** Columnas ligeras (sin Base64) que se devuelven siempre. */
const META = 'id, titulo, imagen_tipo, adjunto_nombre, adjunto_tipo, adjunto_tamano, creada, actualizada';

/** Escapa % _ \ para usar el texto buscado dentro de un LIKE. */
const comodin = (texto) => `%${texto.replace(/[\\%_]/g, '\\$&')}%`;

export async function iniciarEsquema(db) {
  for (const sql of ESQUEMA) await db.execute(sql);
}

export function crearRepositorio(db) {
  const filas = async (sql, args = []) => (await db.execute({ sql, args })).rows;
  const afectadas = async (sql, args = []) => Number((await db.execute({ sql, args })).rowsAffected);

  return {
    /** Total de notas. */
    async contar() {
      const [f] = await filas('SELECT COUNT(*) AS n FROM notas');
      return Number(f.n);
    },

    /** Lista de notas (más recientes primero) con un resumen del texto. `q` busca en título y contenido. */
    async listar({ q = '', limite = 50, desplazamiento = 0 } = {}) {
      const donde = q ? "WHERE titulo LIKE ? ESCAPE '\\' OR contenido LIKE ? ESCAPE '\\'" : '';
      const argsBusqueda = q ? [comodin(q), comodin(q)] : [];
      const [{ total }] = await filas(`SELECT COUNT(*) AS total FROM notas ${donde}`, argsBusqueda);
      const notas = await filas(
        `SELECT ${META}, substr(contenido, 1, ${LARGO_RESUMEN}) AS resumen, length(contenido) AS largo
           FROM notas ${donde}
          ORDER BY actualizada DESC
          LIMIT ? OFFSET ?`,
        [...argsBusqueda, limite, desplazamiento],
      );
      return { total: Number(total), notas };
    },

    /** Una nota completa (texto íntegro, sin Base64). */
    async obtener(id) {
      const [f] = await filas(`SELECT ${META}, contenido FROM notas WHERE id = ?`, [id]);
      return f || null;
    },

    /** Datos Base64 de la imagen o del adjunto de una nota. */
    async media(id, tipo) {
      const sql = tipo === 'imagen'
        ? 'SELECT imagen_tipo AS tipo, imagen_datos AS datos FROM notas WHERE id = ?'
        : 'SELECT adjunto_nombre AS nombre, adjunto_tipo AS tipo, adjunto_datos AS datos FROM notas WHERE id = ?';
      const [f] = await filas(sql, [id]);
      return f && f.datos ? f : null;
    },

    async crear({ id, titulo, contenido, imagen, adjunto }) {
      const ahora = Date.now();
      await afectadas(
        `INSERT INTO notas (id, titulo, contenido, imagen_tipo, imagen_datos,
                            adjunto_nombre, adjunto_tipo, adjunto_tamano, adjunto_datos, creada, actualizada)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id, titulo, contenido,
          imagen ? imagen.tipo : null, imagen ? imagen.datos : null,
          adjunto ? adjunto.nombre : null, adjunto ? adjunto.tipo : null,
          adjunto ? adjunto.tamano : null, adjunto ? adjunto.datos : null,
          ahora, ahora,
        ],
      );
    },

    /**
     * Actualiza una nota. imagen/adjunto: undefined = conservar · null = quitar · objeto = reemplazar.
     * Si llega `version` (y no `forzar`), solo actualiza cuando nadie la modificó mientras tanto.
     * Devuelve las filas afectadas: 0 = no existe o hubo conflicto.
     */
    async actualizar(id, { titulo, contenido, imagen, adjunto, version, forzar }) {
      const sets = ['titulo = ?', 'contenido = ?', 'actualizada = MAX(?, actualizada + 1)'];
      const args = [titulo, contenido, Date.now()];

      if (imagen !== undefined) {
        sets.push('imagen_tipo = ?', 'imagen_datos = ?');
        args.push(imagen ? imagen.tipo : null, imagen ? imagen.datos : null);
      }
      if (adjunto !== undefined) {
        sets.push('adjunto_nombre = ?', 'adjunto_tipo = ?', 'adjunto_tamano = ?', 'adjunto_datos = ?');
        args.push(
          adjunto ? adjunto.nombre : null, adjunto ? adjunto.tipo : null,
          adjunto ? adjunto.tamano : null, adjunto ? adjunto.datos : null,
        );
      }

      let sql = `UPDATE notas SET ${sets.join(', ')} WHERE id = ?`;
      args.push(id);
      if (!forzar && version !== undefined) {
        sql += ' AND actualizada = ?';
        args.push(version);
      }
      return afectadas(sql, args);
    },

    async eliminar(id) {
      return afectadas('DELETE FROM notas WHERE id = ?', [id]);
    },
  };
}
