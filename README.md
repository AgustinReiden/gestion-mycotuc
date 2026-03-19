# Mycotuc Gestion

App interna para gestionar ventas, gastos, inventario, produccion y contactos del emprendimiento Mycotuc.

## Stack

- `Next.js` + `TypeScript` + `Tailwind CSS`
- `Supabase Auth` + `Postgres`
- Formularios con `React Hook Form` + `Zod`
- Despliegue containerizado para `Coolify`

## Que incluye este MVP

- Login por `email/password` con Supabase Auth
- Dashboard con KPIs, alertas y resumen por canal/categoria
- Ventas multi-item con estado de cobro
- Gastos manuales y compras de insumos ligadas a stock
- Inventario de productos e insumos con ajustes manuales
- Produccion por lotes simples
- Agenda de clientes y proveedores
- Reportes por periodo

## Variables de entorno

Copia `.env.example` a `.env.local` y completa:

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

`SUPABASE_SERVICE_ROLE_KEY` no es necesario para esta version, pero quedo documentado para futuras tareas backend-only.

## Base de datos en Supabase

1. Crea un proyecto en Supabase.
2. En `SQL Editor`, ejecuta todas las migraciones de `supabase/migrations` en orden por nombre.
3. Si ya tenias usuarios creados en `Authentication`, asegúrate de ejecutar tambien las migraciones de sincronizacion de perfiles para hacer el backfill.
4. Si quieres cargar datos de ejemplo, ejecuta `supabase/seed/seed.sql`.
5. En `Authentication > Users`, crea manualmente los usuarios del equipo o usa los existentes.

Archivos SQL del proyecto:

- `supabase/migrations/20260318130000_initial_schema.sql`
- `supabase/migrations/20260318152000_auth_profile_sync.sql`
- `supabase/migrations/20260318164000_profile_self_heal_and_policy.sql`
- `supabase/migrations/20260318180000_inventory_history_and_batch_guards.sql`
- `supabase/seed/seed.sql`

## Desarrollo local

```bash
npm.cmd install
npm.cmd run dev
```

La app quedara disponible en `http://localhost:3000`.

## Despliegue en Coolify

1. Crea un nuevo servicio desde el repo Git.
2. Usa el `Dockerfile` incluido en la raiz.
3. Configura las variables `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` y `NEXT_PUBLIC_APP_URL`.
4. Despliega el servicio.

El proyecto ya compila con:

```bash
npm.cmd run lint
npm.cmd run build
```

## Notas del modelo

- Todos los usuarios autenticados comparten permisos operativos.
- Las migraciones `20260318152000_auth_profile_sync.sql` y `20260318164000_profile_self_heal_and_policy.sql` corrigen usuarios ya existentes en `auth.users`, dejan triggers para altas/updates futuros y endurecen la policy de `profiles`.
- La migracion `20260318180000_inventory_history_and_batch_guards.sql` agrega historial legible de movimientos y evita completar lotes con insumos insuficientes o sin salidas cargadas.
- Las compras aumentan stock de insumos y generan un gasto en la categoria `Insumos`.
- El stock actual se calcula desde `inventory_movements`.
- Los lotes impactan inventario solo al completarse.
