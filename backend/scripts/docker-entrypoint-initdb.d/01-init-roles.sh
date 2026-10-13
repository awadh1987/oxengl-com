#!/bin/bash
# ==============================================================================
# OxenGL PostgreSQL Role Initialization Script
# Dynamically configures application and platform roles with appropriate
# privilege levels and security isolation attributes (RLS / BypassRLS).
# ==============================================================================
set -e

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
    DO \$\$
    BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '$APP_DB_USER') THEN
            CREATE ROLE "$APP_DB_USER" WITH LOGIN PASSWORD '$APP_DB_PASSWORD' NOSUPERUSER NOBYPASSRLS NOINHERIT;
        ELSE
            ALTER ROLE "$APP_DB_USER" WITH LOGIN PASSWORD '$APP_DB_PASSWORD';
        END IF;

        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '$PLATFORM_DB_USER') THEN
            CREATE ROLE "$PLATFORM_DB_USER" WITH LOGIN PASSWORD '$PLATFORM_DB_PASSWORD' NOSUPERUSER BYPASSRLS NOINHERIT;
        ELSE
            ALTER ROLE "$PLATFORM_DB_USER" WITH LOGIN PASSWORD '$PLATFORM_DB_PASSWORD' NOSUPERUSER BYPASSRLS NOINHERIT;
        END IF;
    END \$\$;

    GRANT CONNECT ON DATABASE "$POSTGRES_DB" TO "$APP_DB_USER", "$PLATFORM_DB_USER";
    GRANT USAGE, CREATE ON SCHEMA public TO "$APP_DB_USER", "$PLATFORM_DB_USER";
    GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO "$APP_DB_USER", "$PLATFORM_DB_USER";
    GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO "$APP_DB_USER", "$PLATFORM_DB_USER";
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO "$APP_DB_USER", "$PLATFORM_DB_USER";
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO "$APP_DB_USER", "$PLATFORM_DB_USER";
EOSQL
