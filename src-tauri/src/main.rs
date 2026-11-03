// Tauri entry: only opens one window and loads the local page.
// Keep it minimal (no extra deps) so the binary stays small.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("failed to start SalaryTicker");
}
