// Tauri 入口：只做“打开一个窗口加载本地页面”，无多余依赖，保证体积最小
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("启动工资秒表失败");
}
