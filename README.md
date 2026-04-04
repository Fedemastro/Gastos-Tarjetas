# Controlate

**Control inteligente de tus tarjetas y gastos**

Controlate es una Progressive Web App (PWA) para gestionar tarjetas de crédito argentinas con extracción automática de datos desde resúmenes PDF.

## Características

- **Extracción automática de resúmenes PDF**: Sube el PDF de tu resumen de tarjeta y la IA extrae automáticamente todos los consumos, vencimientos, totales y cuotas.
- **Soporte para PDFs encriptados**: Desencripta PDFs protegidos con contraseña (RC4) directamente en el navegador.
- **Multi-tarjeta**: Gestioná VISA, Mastercard, American Express, Naranja y otras.
- **Dashboard inteligente**: Vista consolidada de todas tus tarjetas con vencimientos, totales, pagos mínimos y estado de pago.
- **Gastos por categoría**: Categorización automática y manual de gastos.
- **Extensiones/adicionales**: Seguimiento de gastos de tarjetas adicionales por titular.
- **Gastos de terceros**: Registro de gastos manuales para personas que usan tus tarjetas.
- **Proyección de cuotas**: Gráfico de cuotas pendientes a futuro.
- **Histórico y reportes**: Análisis de gastos por mes, categoría y tarjeta.
- **Cotización dólar oficial**: Actualización automática del tipo de cambio.
- **Sync en la nube**: Tus datos sincronizados via Supabase con autenticación por email o Google.
- **PWA offline-first**: Funciona sin conexión gracias al Service Worker.
- **Export/Import JSON**: Backup y restauración de datos.

## Arquitectura

```
Controlate/
├── index.html          # HTML principal de la PWA
├── app.js              # Lógica principal de la aplicación
├── supabase.js         # Cliente Supabase (auth, CRUD, storage)
├── sw.js               # Service Worker para cache offline
├── worker.js           # Cloudflare Worker (proxy Anthropic + decrypt PDF)
├── manifest.json       # Manifest de la PWA
├── icon-192.png        # Ícono PWA 192x192
├── icon-512.png        # Ícono PWA 512x512
└── README.md
```

### Stack tecnológico

- **Frontend**: HTML/CSS/JS vanilla (sin frameworks), Chart.js para gráficos, PDF.js para lectura de PDFs
- **Backend**: Supabase (PostgreSQL + Auth + Storage)
- **IA**: Anthropic Claude API para extracción de datos de PDFs
- **Proxy**: Cloudflare Worker para proxy de API y desencriptación de PDFs
- **PWA**: Service Worker con estrategia cache-first para assets, network-first para datos

## Configuración

### 1. Supabase

Crear un proyecto en [Supabase](https://supabase.com) y configurar las tablas necesarias:

- `cards` - Tarjetas de crédito
- `summaries` - Resúmenes mensuales
- `expenses` - Gastos individuales
- `ext_holders` - Titulares de extensiones
- `extensions` - Extensiones por resumen
- `extension_items` - Items de extensiones
- `payments` - Pagos realizados
- `categories` - Categorías de gastos
- `gastos_extra` - Gastos manuales propios
- `gastos_terceros` - Gastos de terceros
- `settings` - Configuración (tipo de cambio, etc.)

Actualizar `SUPA_URL` y `SUPA_KEY` en `supabase.js`.

### 2. Cloudflare Worker

Deployar `worker.js` como Cloudflare Worker con las siguientes variables de entorno:

- `ANTHROPIC_API_KEY` - API key de Anthropic
- `AUTH_TOKEN` - Token secreto para autenticación

Actualizar `PROXY_URL` y `AUTH_TOKEN` en `app.js`.

### 3. Deploy

La app se puede servir desde cualquier hosting estático (GitHub Pages, Netlify, Vercel, etc.).

Para GitHub Pages:
1. Crear repo `Controlate`
2. Pushear los archivos
3. Activar GitHub Pages desde Settings > Pages > Source: main branch

La app estará disponible en `https://<usuario>.github.io/Controlate/`

## Uso

1. **Registrarte/Login**: Email + contraseña o Google OAuth
2. **Agregar tarjetas**: Config > Tarjetas > agregar nombre, banco y tipo
3. **Subir resúmenes**: Dashboard > Subir resumen > seleccionar PDF
4. **La IA extrae todo**: Consumos, vencimiento, total, mínimo, cuotas, extensiones
5. **Dashboard**: Ver estado consolidado de todas tus tarjetas
6. **Registrar pagos**: Marcar pagos parciales o totales desde el dashboard

## Licencia

Proyecto privado.
