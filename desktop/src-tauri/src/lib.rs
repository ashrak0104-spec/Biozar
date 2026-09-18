//! BIOZAR — noyau du shell desktop (Tauri 2).
//!
//! La base SQLite est créée dans `%APPDATA%\mg.biozar.app\biozar.db`,
//! un emplacement accessible sans élévation de privilèges : aucun droit
//! particulier à demander à l'utilisateur sous Windows.
//!
//! Le schéma appliqué ici est EXACTEMENT celui de l'APK Android : il est
//! généré depuis `biozar/web/core/schema.js` par `npm run gen:sql` et
//! embarqué à la compilation via `include_str!`. Une seule source de
//! vérité pour les deux plateformes.

use tauri_plugin_sql::{Migration, MigrationKind};

/// Schéma partagé, injecté au moment de la compilation.
const SCHEMA_V1: &str = include_str!("../migrations/v1.sql");

fn migrations() -> Vec<Migration> {
    vec![Migration {
        version: 1,
        description: "socle_offline_v1",
        sql: SCHEMA_V1,
        kind: MigrationKind::Up,
    }]
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations("sqlite:biozar.db", migrations())
                .build(),
        )
        .setup(|app| {
            // La fenêtre est déclarée `visible: false` pour éviter le flash
            // blanc au démarrage : on l'affiche une fois le webview prêt.
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.set_focus();
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("BIOZAR : échec du démarrage de l'application desktop");
}
