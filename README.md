# appNotasJ19 · Backend (API REST)

API en Node.js + Express para el bloc de notas abierto **appNotasJ19**. Guarda texto, imágenes y archivos (en Base64) en una base SQLite en la nube (**Turso**). Sin login, sin contraseñas, CORS abierto a cualquier origen.

## Estructura

```
appNotasJ19-backend/
├── api/index.js          Entrada para Vercel (exporta la app Express)
├── server.js             Entrada para local / Render (escucha en PORT)
├── vercel.json           Redirige todas las rutas a api/index.js
├── package.json
├── .env.example          Plantilla de variables de entorno
└── src/
    ├── app.js            Express: CORS, límites, rutas, errores
    ├── config.js         Lee las variables de entorno
    ├── db.js             Conexión a Turso (o a un archivo local si no hay URL)
    ├── repositorio.js    Consultas SQL (modelo de datos)
    ├── controladores.js  Lógica de cada endpoint
    ├── validacion.js     Validación de texto, imágenes y archivos
    ├── rutas.js          Tabla de rutas
    └── errores.js        Errores HTTP y manejador central
```

## Endpoints

| Método | Ruta | Qué hace |
|---|---|---|
| GET | `/api/salud` | Estado del servidor y la base de datos |
| GET | `/api/config` | Límites vigentes (tamaños, longitudes) |
| GET | `/api/notas?q=&limite=50&desplazamiento=0` | Lista (más recientes primero). `q` busca en título y contenido |
| GET | `/api/notas/:id` | Una nota completa |
| POST | `/api/notas` | Crea una nota |
| PUT | `/api/notas/:id` | Edita una nota |
| DELETE | `/api/notas/:id` | Elimina una nota |
| GET | `/api/notas/:id/imagen` | Descarga la imagen |
| GET | `/api/notas/:id/adjunto` | Descarga el archivo adjunto |

`GET /` devuelve esta misma lista en JSON.

**Crear** (`POST /api/notas`):
```json
{
  "titulo": "Plan",
  "contenido": "Texto largo…",
  "imagen":  { "datos": "<Base64 o data:image/png;base64,…>" },
  "adjunto": { "nombre": "informe.pdf", "tipo": "application/pdf", "datos": "<Base64>" }
}
```
`imagen` y `adjunto` son opcionales. Solo se aceptan imágenes PNG, JPG, GIF y WEBP (se comprueba el contenido real; SVG se rechaza a propósito).

**Editar** (`PUT /api/notas/:id`): mismo cuerpo, más `version` (el valor `actualizada` que recibiste al leer la nota).
- `imagen`/`adjunto` omitidos → se conservan · `null` → se eliminan · objeto → se reemplazan.
- Si otra persona editó la nota antes, responde **409** con `{ "codigo": "conflicto", "nota": {…} }`. Reenvía con `"forzar": true` para sobrescribir.

**Errores**: siempre JSON `{ "error": "mensaje" }` (400 datos inválidos, 404 no existe, 409 conflicto, 413 demasiado grande, 429 demasiadas peticiones).

## Variables de entorno

| Variable | Obligatoria | Descripción |
|---|---|---|
| `TURSO_DATABASE_URL` | En producción | `libsql://tu-base-usuario.turso.io` |
| `TURSO_AUTH_TOKEN` | En producción | Token de acceso de la base |
| `PORT` | No | Puerto local (3000) |
| `MAX_MEDIA_MB` | No | Imagen + archivo por guardado (3). En Vercel no subas de ~3: el límite de petición es ~4,5 MB y Base64 pesa un 33 % más |
| `MAX_NOTAS` | No | Máximo de notas (1000) |
| `RATE_LIMIT_READ` / `RATE_LIMIT_WRITE` | No | Peticiones por minuto y por IP (300 / 40) |

## Probar en local

```bash
cd appNotasJ19-backend
npm install
cp .env.example .env      # puedes dejarlo vacío: sin Turso usa el archivo data/notas.db
npm run dev
```
Abre http://localhost:3000/api/salud → `{"ok":true,…}`.

## Crear la base en Turso (gratis)

```bash
# instalar CLI: https://docs.turso.tech/cli/installation
turso auth signup            # o: turso auth login
turso db create appnotasj19
turso db show appnotasj19 --url          # → TURSO_DATABASE_URL
turso db tokens create appnotasj19       # → TURSO_AUTH_TOKEN
```
La tabla se crea sola en el primer arranque. Revisa los límites del plan gratuito en turso.tech (pueden cambiar).

## Subir a GitHub

```bash
git init
git add .
git commit -m "appNotasJ19 backend"
git branch -M main
git remote add origin https://github.com/TU_USUARIO/appnotasj19-backend.git
git push -u origin main
```
`.gitignore` ya excluye `node_modules` y `.env`: **nunca subas tu token**.

## Desplegar en Vercel

1. vercel.com → *Add New… → Project* → importa el repositorio.
2. *Environment Variables*: añade `TURSO_DATABASE_URL` y `TURSO_AUTH_TOKEN`.
3. *Deploy*. Tu API quedará en `https://TU-PROYECTO.vercel.app` (prueba `/api/salud`).

## Desplegar en Render (alternativa)

*New → Web Service* → repositorio → Build: `npm install` · Start: `npm start` · añade las mismas variables. (En el plan gratuito se "duerme" y la primera petición tarda.)

## Notas de seguridad

- La API es **pública a propósito**: cualquiera puede crear, editar y borrar. No guardes datos privados.
- Protecciones incluidas: límite de peticiones por IP, tamaño máximo por guardado, máximo de notas, validación del tipo real de imagen, descargas con `Content-Disposition: attachment` y `nosniff`.
- Aun así, un usuario malintencionado podría llenar o borrar el bloc. Si pasa, baja `MAX_NOTAS`, o haz copias con `turso db shell`.
