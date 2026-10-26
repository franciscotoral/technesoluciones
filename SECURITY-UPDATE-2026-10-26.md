# Actualización de seguridad npm — 26/10/2026

## Cambios

- Angular framework y compiler-cli: 20.3.6 → 20.3.34.
- Angular build y CLI: 20.3.6 → 20.3.41.
- Vite directo: 6.4.1 → 6.4.5.
- Constructor, CLI y compiler-cli clasificados como dependencias de desarrollo.
- Bloqueo regenerado sin --force ni --legacy-peer-deps; actualizadas las dependencias compatibles, incluido Supabase JS 2.118.0 y sus transitivas.

## Validación

- npm ci completado y npm audit: 0 vulnerabilidades conocidas (antes: 47).
- npm run build completado, incluidas las copias de rutas estáticas.
- Diez pruebas del formulario con Angular Forms real y HTTP/Analytics simulados: correctas. No se enviaron correos.
- Compilación de producción servida en localhost:3001: portada, navegación a demostración, herramienta preseleccionada, cambio de motivo conservando datos, validación, idiomas ES/EN, temas claro/oscuro, pantalla de login y recarga comprobados; sin errores de consola observados.
- Integridad del manifiesto del service worker: 38 archivos y cero discrepancias SHA1.

## Límites

No se probó una sesión autenticada de Supabase, entrega real del formulario, recepción en GA ni migración de una caché antigua en un navegador de producción. La auditoría npm no cubre backend Python, sistema operativo, Nginx ni reglas de acceso de Supabase. Cero alertas conocidas no garantiza ausencia de vulnerabilidades.

## Despliegue

La captura del servidor confirma el checkout en /root/app y publicación en /var/www/technesoluciones/public. Instalar con npm ci --include=dev para disponer del compilador; construir antes de copiar dist. Conservar una copia del directorio publicado y mantener los archivos ajenos a esta web y los bundles antiguos usados por sesiones abiertas. No usar rsync --delete sobre un directorio que aloje otras aplicaciones. No se necesita reiniciar el backend por este cambio.

Mejora posterior: construir como usuario sin privilegios o en CI en lugar de root, y publicar solo los archivos generados.
