mod auval;
mod bundle;
mod commands;
mod library;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            commands::parse_project,
            library::scan_folder
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
