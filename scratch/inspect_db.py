import json
import psycopg
from psycopg.rows import dict_row

db_url = "postgresql://neondb_owner:npg_3mdh8SwqTczI@ep-square-scene-aqoz2hmu-pooler.c-8.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require"

with psycopg.connect(db_url, row_factory=dict_row) as conn:
    with conn.cursor() as cur:
        cur.execute("SELECT version, architecture_json, created_at FROM architectures ORDER BY created_at DESC LIMIT 1;")
        row = cur.fetchone()
        if row:
            with open("scratch/raw_response.json", "w") as f:
                json.dump(row["architecture_json"], f, indent=2)
            print("Successfully wrote raw_response.json")
        else:
            print("No architecture records found in database.")
