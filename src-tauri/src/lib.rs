mod auval;
mod bundle;
mod commands;
mod library;

use std::sync::Mutex;

use serde::Deserialize;
use tauri::menu::{CheckMenuItem, Menu, MenuItem, PredefinedMenuItem, Submenu};
use tauri::{AppHandle, Emitter, State, Wry};

/// Local-time wall-clock stamp used by the `tlog!` macro. Format
/// `HH:MM:SS.mmm` — short enough to scan, precise enough to spot
/// 100ms-scale stalls. Re-evaluated on every call (no static cache);
/// `chrono::Local::now()` is cheap relative to the eprintln itself.
#[doc(hidden)]
pub fn now_hms() -> String {
    chrono::Local::now().format("%H:%M:%S%.3f").to_string()
}

/// Diagnostic logger. Prepends `[HH:MM:SS.mmm]` local time to every
/// line and writes to stderr — appears in the `tauri dev` terminal.
/// Used by both Rust callers and the `log_event` Tauri command (which
/// is invoked by the JS-side dev-log bridge), so JS and Rust events
/// share a single timeline.
#[macro_export]
macro_rules! tlog {
    ($($arg:tt)*) => {
        eprintln!("[{}] {}", $crate::now_hms(), format_args!($($arg)*))
    };
}

const MENU_OPEN_PROJECT: &str = "menu_open_project";
const MENU_OPEN_FOLDER: &str = "menu_open_folder";
const MENU_CLEAR_RECENT_PROJECTS: &str = "clear_recent_projects";
const MENU_CLEAR_RECENT_FOLDERS: &str = "clear_recent_folders";
const MENU_REPORT_ISSUE: &str = "help_report_issue";
const MENU_BUY_ME_COFFEE: &str = "help_buy_me_coffee";
const MENU_CHECK_FOR_UPDATES: &str = "check_for_updates";
const MENU_THEME_SYSTEM: &str = "theme_system";
const MENU_THEME_LIGHT: &str = "theme_light";
const MENU_THEME_DARK: &str = "theme_dark";
const PREFIX_RECENT_PROJECT: &str = "recent_project::";
const PREFIX_RECENT_FOLDER: &str = "recent_folder::";
const MENU_EVENT: &str = "menu-event";

const THEME_SYSTEM: &str = "system";
const THEME_LIGHT: &str = "light";
const THEME_DARK: &str = "dark";

/// Tauri-managed state holding the theme that should be checked in the
/// View menu (lpx-explorer-3x8). Read on every menu rebuild — both
/// `set_recent_menu` and `set_theme_menu` consult this so a recents
/// update doesn't lose the theme checkmark, and a theme update
/// preserves the recents.
#[derive(Default)]
struct AppMenuState {
    active_theme: Mutex<String>,
}

fn active_theme_or_default(state: &AppMenuState) -> String {
    let guard = state.active_theme.lock().expect("theme state poisoned");
    if guard.is_empty() {
        THEME_SYSTEM.to_owned()
    } else {
        guard.clone()
    }
}

fn build_view_submenu(
    app: &AppHandle,
    active_theme: &str,
) -> tauri::Result<Submenu<Wry>> {
    let system = CheckMenuItem::with_id(
        app,
        MENU_THEME_SYSTEM,
        "System",
        true,
        active_theme == THEME_SYSTEM,
        None::<&str>,
    )?;
    let light = CheckMenuItem::with_id(
        app,
        MENU_THEME_LIGHT,
        "Light",
        true,
        active_theme == THEME_LIGHT,
        None::<&str>,
    )?;
    let dark = CheckMenuItem::with_id(
        app,
        MENU_THEME_DARK,
        "Dark",
        true,
        active_theme == THEME_DARK,
        None::<&str>,
    )?;
    Submenu::with_items(app, "View", true, &[&system, &light, &dark])
}

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
    active_theme: &str,
) -> tauri::Result<Menu<Wry>> {
    let app_menu = Submenu::with_items(
        app,
        "LPX Explorer",
        true,
        &[
            &PredefinedMenuItem::about(app, None, None)?,
            &PredefinedMenuItem::separator(app)?,
            // Sparkle 'Check for Updates…' (lpx-explorer-tat). macOS-only;
            // on other platforms the menu_event handler emits a no-op.
            // The menu item itself is always present so menu rebuilds
            // (theme / recents) don't have to branch on platform.
            &MenuItem::with_id(
                app,
                MENU_CHECK_FOR_UPDATES,
                "Check for Updates…",
                true,
                None::<&str>,
            )?,
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

    let view_menu = build_view_submenu(app, active_theme)?;

    Menu::with_items(
        app,
        &[&app_menu, &file_menu, &edit_menu, &view_menu, &help_menu],
    )
}

/// Frontend-invoked rebuild: called whenever the recent-projects or
/// recent-folders list changes (in-session adds, hydration on launch,
/// "Clear Menu" wipes). Re-sets the entire native menu so the submenus
/// reflect the latest state. The View-menu checkmark is preserved by
/// reading the theme from the AppMenuState managed by Tauri.
#[tauri::command]
fn set_recent_menu(
    app: AppHandle,
    state: State<'_, AppMenuState>,
    recent_projects: Vec<RecentMenuItem>,
    recent_folders: Vec<RecentMenuItem>,
) -> Result<(), String> {
    let active_theme = active_theme_or_default(&state);
    let menu = build_menu(&app, &recent_projects, &recent_folders, &active_theme)
        .map_err(|e| format!("failed to build menu: {e}"))?;
    app.set_menu(menu)
        .map_err(|e| format!("failed to set menu: {e}"))?;
    Ok(())
}

/// Frontend-invoked: update the active-theme checkmark in the View
/// menu (lpx-explorer-3x8). Stores the theme in AppMenuState so
/// subsequent menu rebuilds (recents updates, etc) keep the checkmark
/// in the right place. Rebuilds with empty recents — the frontend
/// re-pushes recents via set_recent_menu on its own schedule.
#[tauri::command]
fn set_theme_menu(
    app: AppHandle,
    state: State<'_, AppMenuState>,
    theme: String,
) -> Result<(), String> {
    {
        let mut guard = state
            .active_theme
            .lock()
            .map_err(|e| format!("theme state poisoned: {e}"))?;
        *guard = theme.clone();
    }
    let menu = build_menu(&app, &[], &[], &theme)
        .map_err(|e| format!("failed to build menu: {e}"))?;
    app.set_menu(menu)
        .map_err(|e| format!("failed to set menu: {e}"))?;
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tlog!("[main] start");
    let mut builder = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_http::init())
        .manage(AppMenuState::default())
        .invoke_handler(tauri::generate_handler![
            auval::load_au_registry,
            auval::run_au_scan,
            commands::is_dir,
            commands::home_dir,
            commands::list_alternatives,
            commands::log_event,
            commands::parse_alternative,
            commands::parse_project,
            commands::project_data_stat,
            library::scan_folder,
            set_recent_menu,
            set_theme_menu
        ]);

    // Sparkle auto-updater (lpx-explorer-tat) — macOS only. The
    // plugin handles dialog / progress / 'Remind Me Later' /
    // background checks on its own once registered.
    #[cfg(target_os = "macos")]
    {
        builder = builder.plugin(tauri_plugin_sparkle_updater::init());
    }

    builder
        .setup(|app| {
            tlog!("[main] setup() entered");
            // Initial menu uses 'system' as the default theme; the
            // frontend re-pushes the persisted preference once it
            // hydrates via set_theme_menu.
            let menu = build_menu(app.handle(), &[], &[], THEME_SYSTEM)?;
            app.set_menu(menu)?;
            tlog!("[main] setup() done — menu attached, webview booting");
            Ok(())
        })
        .on_menu_event(|app, event| {
            let id = event.id().0.as_str();
            // Sparkle 'Check for Updates…' is handled in-process so the
            // plugin's UI flow runs on the macOS main thread without a
            // round-trip through the JS menu-event channel. Other menu
            // IDs continue to flow through the existing channel.
            #[cfg(target_os = "macos")]
            if id == MENU_CHECK_FOR_UPDATES {
                use tauri_plugin_sparkle_updater::SparkleUpdaterExt;
                if let Some(updater) = app.sparkle_updater() {
                    let _ = updater.check_for_updates();
                }
                return;
            }
            let _ = app.emit(MENU_EVENT, id.to_owned());
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
