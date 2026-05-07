mod auval;
mod bundle;
mod commands;
mod library;

use serde::Deserialize;
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem, Submenu};
use tauri::{AppHandle, Emitter, Wry};

const MENU_OPEN_PROJECT: &str = "menu_open_project";
const MENU_OPEN_FOLDER: &str = "menu_open_folder";
const MENU_CLEAR_RECENT_PROJECTS: &str = "clear_recent_projects";
const MENU_CLEAR_RECENT_FOLDERS: &str = "clear_recent_folders";
const MENU_REPORT_ISSUE: &str = "help_report_issue";
const MENU_BUY_ME_COFFEE: &str = "help_buy_me_coffee";
const PREFIX_RECENT_PROJECT: &str = "recent_project::";
const PREFIX_RECENT_FOLDER: &str = "recent_folder::";
const MENU_EVENT: &str = "menu-event";

#[derive(Debug, Deserialize)]
pub struct RecentMenuItem {
    pub path: String,
    pub name: String,
}

fn build_recent_submenu(
    app: &AppHandle,
    label: &str,
    items: &[RecentMenuItem],
    id_prefix: &str,
    clear_id: &str,
) -> tauri::Result<Submenu<Wry>> {
    let mut entries: Vec<Box<dyn tauri::menu::IsMenuItem<Wry>>> = Vec::new();
    if items.is_empty() {
        // Empty submenu reads more naturally than a hidden one — the
        // user can see the feature exists even before they've opened
        // anything. macOS standard is a single disabled "No items"-style
        // entry; we rely on the (also disabled) Clear Menu below to make
        // the absence visible.
    } else {
        for item in items {
            let id = format!("{}{}", id_prefix, item.path);
            entries.push(Box::new(MenuItem::with_id(
                app, id, &item.name, true, None::<&str>,
            )?));
        }
        entries.push(Box::new(PredefinedMenuItem::separator(app)?));
    }
    entries.push(Box::new(MenuItem::with_id(
        app,
        clear_id,
        "Clear Menu",
        !items.is_empty(),
        None::<&str>,
    )?));

    let entry_refs: Vec<&dyn tauri::menu::IsMenuItem<Wry>> =
        entries.iter().map(|b| b.as_ref()).collect();
    Submenu::with_items(app, label, true, &entry_refs)
}

fn build_menu(
    app: &AppHandle,
    recent_projects: &[RecentMenuItem],
    recent_folders: &[RecentMenuItem],
) -> tauri::Result<Menu<Wry>> {
    let app_menu = Submenu::with_items(
        app,
        "LPX Explorer",
        true,
        &[
            &PredefinedMenuItem::about(app, None, None)?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::services(app, None)?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::hide(app, None)?,
            &PredefinedMenuItem::hide_others(app, None)?,
            &PredefinedMenuItem::show_all(app, None)?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::quit(app, None)?,
        ],
    )?;

    let recent_projects_submenu = build_recent_submenu(
        app,
        "Open Recent Project",
        recent_projects,
        PREFIX_RECENT_PROJECT,
        MENU_CLEAR_RECENT_PROJECTS,
    )?;
    let recent_folders_submenu = build_recent_submenu(
        app,
        "Open Recent Folder",
        recent_folders,
        PREFIX_RECENT_FOLDER,
        MENU_CLEAR_RECENT_FOLDERS,
    )?;

    let file_menu = Submenu::with_items(
        app,
        "File",
        true,
        &[
            &MenuItem::with_id(
                app,
                MENU_OPEN_PROJECT,
                "Open Project…",
                true,
                Some("CmdOrCtrl+O"),
            )?,
            &recent_projects_submenu,
            &PredefinedMenuItem::separator(app)?,
            &MenuItem::with_id(
                app,
                MENU_OPEN_FOLDER,
                "Open Folder…",
                true,
                Some("CmdOrCtrl+Shift+O"),
            )?,
            &recent_folders_submenu,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::close_window(app, None)?,
        ],
    )?;

    let edit_menu = Submenu::with_items(
        app,
        "Edit",
        true,
        &[
            &PredefinedMenuItem::undo(app, None)?,
            &PredefinedMenuItem::redo(app, None)?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::cut(app, None)?,
            &PredefinedMenuItem::copy(app, None)?,
            &PredefinedMenuItem::paste(app, None)?,
            &PredefinedMenuItem::select_all(app, None)?,
        ],
    )?;

    // Help menu — frontend handles MENU_EVENT for these IDs and dispatches
    // to tauri-plugin-opener::openUrl. lpx-explorer-5hf.
    let help_menu = Submenu::with_items(
        app,
        "Help",
        true,
        &[
            &MenuItem::with_id(
                app,
                MENU_REPORT_ISSUE,
                "Report an Issue…",
                true,
                None::<&str>,
            )?,
            &PredefinedMenuItem::separator(app)?,
            &MenuItem::with_id(
                app,
                MENU_BUY_ME_COFFEE,
                "Buy Me a Coffee…",
                true,
                None::<&str>,
            )?,
        ],
    )?;

    Menu::with_items(app, &[&app_menu, &file_menu, &edit_menu, &help_menu])
}

/// Frontend-invoked rebuild: called whenever the recent-projects or
/// recent-folders list changes (in-session adds, hydration on launch,
/// "Clear Menu" wipes). Re-sets the entire native menu so the submenus
/// reflect the latest state.
#[tauri::command]
fn set_recent_menu(
    app: AppHandle,
    recent_projects: Vec<RecentMenuItem>,
    recent_folders: Vec<RecentMenuItem>,
) -> Result<(), String> {
    let menu = build_menu(&app, &recent_projects, &recent_folders)
        .map_err(|e| format!("failed to build menu: {e}"))?;
    app.set_menu(menu)
        .map_err(|e| format!("failed to set menu: {e}"))?;
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .invoke_handler(tauri::generate_handler![
            auval::load_au_registry,
            auval::run_au_scan,
            commands::is_dir,
            commands::home_dir,
            commands::log_event,
            commands::parse_project,
            library::scan_folder,
            set_recent_menu
        ])
        .setup(|app| {
            // Initial menu has empty submenus; the frontend rehydrates
            // recents from `tauri-plugin-store` at startup and calls
            // `set_recent_menu` to populate.
            let menu = build_menu(app.handle(), &[], &[])?;
            app.set_menu(menu)?;
            Ok(())
        })
        .on_menu_event(|app, event| {
            let id = event.id().0.as_str();
            let _ = app.emit(MENU_EVENT, id.to_owned());
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
