# db-migrate — architecture

Applies the migrations under `packages/db/src/migrations` in order, recording each one
it applies so a run only ever applies what is new. An already-applied migration
is never edited: a change is a new, later migration.

## Migrations

- `000_control`
- `100_black_lifeguard`
- `101_thin_supreme_intelligence`
- `102_material_crystal`
- `103_heavy_whirlwind`
- `104_natural_wallow`
- `105_awesome_riptide`
- `106_brainy_wrecking_crew`
- `107_illegal_mephistopheles`
- `108_glamorous_riptide`
- `109_thankful_may_parker`
- `110_lonely_kang`
- `111_feedback_anonymization`
- `112_knowledge_library_notes`
- `113_library_files`
- `114_private_file_object_keys`
- `115_library_file_object_keys_only`
- `116_wrap_rls_current_setting`
- `117_usage_budget`
- `118_reconcile_usage_budget_snapshot`
- `119_rainy_jack_flag`
- `120_add_parts_search_fts`
- `200_app_secrets`
- `210_row_level_security`

## Resolved at run time (names only)

- `SUPABASE_ACCESS_TOKEN`
- `SUPABASE_DB_PASSWORD`
- `SUPABASE_DB_URL`
- `SUPABASE_PROJECT_REF`
