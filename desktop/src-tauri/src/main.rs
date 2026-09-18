// BIOZAR — point d'entrée Windows.
// `windows_subsystem = "windows"` empêche l'ouverture d'une console noire
// derrière la fenêtre en release.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    biozar_desktop_lib::run()
}
