-- MF-89: only the isolated Netlify production scheduler receives this credential.
-- Password is provisioned out of band; never place a reusable secret in a migration.
alter role metaflow_dashboard_reader login;
