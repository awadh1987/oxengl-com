-- ==============================================================================
-- OxenGL ERP PostgreSQL Default Privileges & Role Initialization Script
-- Mounted at: /docker-entrypoint-initdb.d/init-permissions.sql
-- Ensures oxengl_app and oxengl_platform have full access to current and future
-- tables and sequences in the public schema.
-- ==============================================================================

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'oxengl_app') THEN
        CREATE ROLE oxengl_app LOGIN NOSUPERUSER NOBYPASSRLS NOINHERIT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'oxengl_platform') THEN
        CREATE ROLE oxengl_platform LOGIN NOSUPERUSER BYPASSRLS NOINHERIT;
    END IF;
END
$$;

-- Grant schema usage and creation privileges
GRANT USAGE, CREATE ON SCHEMA public TO oxengl_app, oxengl_platform;

-- Grant full access on all existing tables and sequences in public schema
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO oxengl_app, oxengl_platform;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO oxengl_app, oxengl_platform;

-- Grant default privileges for future objects created by the current/postgres role
ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT ALL PRIVILEGES ON TABLES TO oxengl_app, oxengl_platform;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT ALL PRIVILEGES ON SEQUENCES TO oxengl_app, oxengl_platform;

-- Also ensure objects created during migrations by oxengl_app or oxengl_platform
-- automatically grant full access to both roles
ALTER DEFAULT PRIVILEGES FOR ROLE oxengl_app IN SCHEMA public
    GRANT ALL PRIVILEGES ON TABLES TO oxengl_app, oxengl_platform;

ALTER DEFAULT PRIVILEGES FOR ROLE oxengl_app IN SCHEMA public
    GRANT ALL PRIVILEGES ON SEQUENCES TO oxengl_app, oxengl_platform;

ALTER DEFAULT PRIVILEGES FOR ROLE oxengl_platform IN SCHEMA public
    GRANT ALL PRIVILEGES ON TABLES TO oxengl_app, oxengl_platform;

ALTER DEFAULT PRIVILEGES FOR ROLE oxengl_platform IN SCHEMA public
    GRANT ALL PRIVILEGES ON SEQUENCES TO oxengl_app, oxengl_platform;
