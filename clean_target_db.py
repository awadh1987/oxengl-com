from sqlalchemy import create_engine, text

TARGET_URL = "postgresql+psycopg2://tenant_admin:TestPassword2026!@200.141.10.213:5435/oxengl_tenant_db"

def clean_db():
    print("Connecting to target database...", flush=True)
    engine = create_engine(TARGET_URL, connect_args={"connect_timeout": 10})
    with engine.connect() as conn:
        print("Fetching existing tables...", flush=True)
        tables = conn.execute(text("SELECT tablename FROM pg_tables WHERE schemaname = 'public';")).fetchall()
        print(f"Found {len(tables)} tables. Dropping with CASCADE...", flush=True)
        for t in tables:
            conn.execute(text(f'DROP TABLE IF EXISTS public."{t[0]}" CASCADE;'))
        conn.commit()
    print("Target DB wiped successfully. Ready for fresh migration.", flush=True)

if __name__ == "__main__":
    clean_db()
