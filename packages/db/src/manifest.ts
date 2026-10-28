import type { MigrationManifest } from "./types.js";

// Every migration the runner applies, in order, with the sha256 of its file.
// `pnpm --filter @saas/db run manifest:check` verifies the checksums;
// `manifest:fix` rewrites them after a migration file changes (only ever
// before that migration has been applied anywhere — an applied migration's
// checksum is immutable).
//
// 100–120 are upstream's drizzle migrations, one for one and byte for byte
// (apps/web/drizzle/<NNNN>_<name>.sql, the files drizzle-kit applies to a
// local database); 200 and 210 are this baseline's.
export const manifest: MigrationManifest = {
  version: 1,
  migrations: [
    {
      id: "000_control_baseline",
      context: "control",
      path: "000_control/up.sql",
      checksum:
        "2a5d7f30684c99e3ff441ca8a2c38038dedd1bab4db4a40e92cd36bb22be297f",
      description:
        "Baseline control migration \u2014 creates the migration tracking schema",
    },
    {
      id: "100_black_lifeguard",
      context: "app",
      path: "100_black_lifeguard/up.sql",
      checksum:
        "2873f4387f08011360fc1dfd010836a87af615596c7019b9822be6a93bc4cb69",
      description:
        "Verbatim from upstream drizzle/0000_black_lifeguard.sql (apps/web/drizzle is the same SQL for drizzle-kit)",
    },
    {
      id: "101_thin_supreme_intelligence",
      context: "app",
      path: "101_thin_supreme_intelligence/up.sql",
      checksum:
        "e085f312e26d57e9586e978e7199d1d6965c4bf87a08d487fc9c28095b5d58d0",
      description:
        "Verbatim from upstream drizzle/0001_thin_supreme_intelligence.sql (apps/web/drizzle is the same SQL for drizzle-kit)",
    },
    {
      id: "102_material_crystal",
      context: "app",
      path: "102_material_crystal/up.sql",
      checksum:
        "44cdad6584bee54a8195f3f1c015bd3c66f653ed0953b6ae223686feeaa4d0e2",
      description:
        "Verbatim from upstream drizzle/0002_material_crystal.sql (apps/web/drizzle is the same SQL for drizzle-kit)",
    },
    {
      id: "103_heavy_whirlwind",
      context: "app",
      path: "103_heavy_whirlwind/up.sql",
      checksum:
        "e349170faf0a76f72a945910cb4b45aec84f90285af44872a961e5cb56a16554",
      description:
        "Verbatim from upstream drizzle/0003_heavy_whirlwind.sql (apps/web/drizzle is the same SQL for drizzle-kit)",
    },
    {
      id: "104_natural_wallow",
      context: "app",
      path: "104_natural_wallow/up.sql",
      checksum:
        "4e3129b37c19244f3c8c868ce661e31c6485f08259b5e7851a4d4fe17986b147",
      description:
        "Verbatim from upstream drizzle/0004_natural_wallow.sql (apps/web/drizzle is the same SQL for drizzle-kit)",
    },
    {
      id: "105_awesome_riptide",
      context: "app",
      path: "105_awesome_riptide/up.sql",
      checksum:
        "c800b746e1aac15964412e326962a46e84aa1eb860e2cb7916776fa9c24e0e23",
      description:
        "Verbatim from upstream drizzle/0005_awesome_riptide.sql (apps/web/drizzle is the same SQL for drizzle-kit)",
    },
    {
      id: "106_brainy_wrecking_crew",
      context: "app",
      path: "106_brainy_wrecking_crew/up.sql",
      checksum:
        "f21a7de092a8fb1cda65f6d15b0bc94b94ea78ef77d4e5367a6d1f1d978c210f",
      description:
        "Verbatim from upstream drizzle/0006_brainy_wrecking_crew.sql (apps/web/drizzle is the same SQL for drizzle-kit)",
    },
    {
      id: "107_illegal_mephistopheles",
      context: "app",
      path: "107_illegal_mephistopheles/up.sql",
      checksum:
        "88df17d1c695b4ce3bff13924ed3858de0caaabcebde79114f8d946987adb0c6",
      description:
        "Verbatim from upstream drizzle/0007_illegal_mephistopheles.sql (apps/web/drizzle is the same SQL for drizzle-kit)",
    },
    {
      id: "108_glamorous_riptide",
      context: "app",
      path: "108_glamorous_riptide/up.sql",
      checksum:
        "8854b06aa2542f7b3aa4d49a5f1ed09bbeeab36be79c1419f993343ea2c432d6",
      description:
        "Verbatim from upstream drizzle/0008_glamorous_riptide.sql (apps/web/drizzle is the same SQL for drizzle-kit)",
    },
    {
      id: "109_thankful_may_parker",
      context: "app",
      path: "109_thankful_may_parker/up.sql",
      checksum:
        "816392bc82ffa6cbbceb156dda99753a1999b2cdf4bc93f3b3efcf4696463405",
      description:
        "Verbatim from upstream drizzle/0009_thankful_may_parker.sql (apps/web/drizzle is the same SQL for drizzle-kit)",
    },
    {
      id: "110_lonely_kang",
      context: "app",
      path: "110_lonely_kang/up.sql",
      checksum:
        "a9c2d604765b68ed4b0f466cc247375556ea4b6d6d33acc94eabb985ad2b9c1e",
      description:
        "Verbatim from upstream drizzle/0010_lonely_kang.sql (apps/web/drizzle is the same SQL for drizzle-kit)",
    },
    {
      id: "111_feedback_anonymization",
      context: "app",
      path: "111_feedback_anonymization/up.sql",
      checksum:
        "5ca98120b1b8b814c0c1c44c7e7d38dba23859fdce629b84b0f235a24d80a51d",
      description:
        "Verbatim from upstream drizzle/0011_feedback_anonymization.sql (apps/web/drizzle is the same SQL for drizzle-kit)",
    },
    {
      id: "112_knowledge_library_notes",
      context: "app",
      path: "112_knowledge_library_notes/up.sql",
      checksum:
        "db60082cecf46c73f9323d986366488d6a8efbfa3bd4de363efd64272c1fc253",
      description:
        "Verbatim from upstream drizzle/0012_knowledge_library_notes.sql (apps/web/drizzle is the same SQL for drizzle-kit)",
    },
    {
      id: "113_library_files",
      context: "app",
      path: "113_library_files/up.sql",
      checksum:
        "a72071a003e91fa39e76579418eb44508d6d43d724773396ff47a264758aaf9a",
      description:
        "Verbatim from upstream drizzle/0013_library_files.sql (apps/web/drizzle is the same SQL for drizzle-kit)",
    },
    {
      id: "114_private_file_object_keys",
      context: "app",
      path: "114_private_file_object_keys/up.sql",
      checksum:
        "7bec2f2679c48bf9333d95cb579a6d0adfcf755f45133fc2d9fcfff075eced82",
      description:
        "Verbatim from upstream drizzle/0014_private_file_object_keys.sql (apps/web/drizzle is the same SQL for drizzle-kit)",
    },
    {
      id: "115_library_file_object_keys_only",
      context: "app",
      path: "115_library_file_object_keys_only/up.sql",
      checksum:
        "9a48377853c83735db799b7d9f3812a04b11315390161237262075ed2dffda03",
      description:
        "Verbatim from upstream drizzle/0015_library_file_object_keys_only.sql (apps/web/drizzle is the same SQL for drizzle-kit)",
    },
    {
      id: "116_wrap_rls_current_setting",
      context: "app",
      path: "116_wrap_rls_current_setting/up.sql",
      checksum:
        "ef8b68e153015617c0aa16ab2699d8fc6d9b61fe93bd4fe8cd2a3356fbd2b7b4",
      description:
        "Verbatim from upstream drizzle/0016_wrap_rls_current_setting.sql (apps/web/drizzle is the same SQL for drizzle-kit)",
    },
    {
      id: "117_usage_budget",
      context: "app",
      path: "117_usage_budget/up.sql",
      checksum:
        "b0b235114a7187d00b2bbc95977c714185d3c70f53a18adf79ae5f22cde0e0e5",
      description:
        "Verbatim from upstream drizzle/0017_usage_budget.sql (apps/web/drizzle is the same SQL for drizzle-kit)",
    },
    {
      id: "118_reconcile_usage_budget_snapshot",
      context: "app",
      path: "118_reconcile_usage_budget_snapshot/up.sql",
      checksum:
        "645341cc759ddee990532c5063f22fd3843798b723c3b3dfe8f117f99c070da7",
      description:
        "Verbatim from upstream drizzle/0018_reconcile_usage_budget_snapshot.sql (apps/web/drizzle is the same SQL for drizzle-kit)",
    },
    {
      id: "119_rainy_jack_flag",
      context: "app",
      path: "119_rainy_jack_flag/up.sql",
      checksum:
        "f2d410642d94bf54385fbde76945af2f5c1e4dd76eac49a56033f9b53b04aa36",
      description:
        "Verbatim from upstream drizzle/0019_rainy_jack_flag.sql (apps/web/drizzle is the same SQL for drizzle-kit)",
    },
    {
      id: "120_add_parts_search_fts",
      context: "app",
      path: "120_add_parts_search_fts/up.sql",
      checksum:
        "25603c24f07084a6367e0e2b684a51500c4408232e9d0049822cff947bc0d1a9",
      description:
        "Verbatim from upstream drizzle/0020_add_parts_search_fts.sql (apps/web/drizzle is the same SQL for drizzle-kit)",
    },
    {
      id: "200_app_secrets",
      context: "app",
      path: "200_app_secrets/up.sql",
      checksum:
        "654bd99ad6882f368d351bb9a19d59fa55efa24bc61e30e6f78643f92a5e96e5",
      description:
        "app_private.secrets with the Better Auth signing key generated once per database (apps/web/lib/auth/better-auth/config.ts reads it; a BETTER_AUTH_SECRET Worker secret wins)",
    },
    {
      id: "210_row_level_security",
      context: "app",
      path: "210_row_level_security/up.sql",
      checksum:
        "7cbc475cf9c344cfa239ccac3a5ad12d408794ff07ee8d8eb3890b2f8e10ddcf",
      description:
        "Supabase's Data API shut out: row-level security on every table in public and every privilege of anon and authenticated revoked (upstream's policies are written TO public); refuses to run if the app's role would be locked out",
    },
  ],
};
