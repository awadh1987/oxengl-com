-- OxenGL Multi-Tenant & Platform Privilege Grant Script
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO oxengl_app, oxengl_platform;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO oxengl_app, oxengl_platform;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO oxengl_app, oxengl_platform;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO oxengl_app, oxengl_platform;
