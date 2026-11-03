// Tauri 入口：打开窗口加载本地页面。
// 关键：启动失败（如 WebView2 创建失败）时不要静默闪退，
// 而是弹窗告知原因 + 提供修复指引，避免用户以为是“打不开”。
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::panic;

#[cfg(target_os = "windows")]
fn show_error_dialog(msg: &str) {
    use std::ffi::OsStr;
    use std::os::windows::ffi::OsStrExt;

    #[link(name = "user32")]
    extern "system" {
        fn MessageBoxW(hwnd: *mut core::ffi::c_void, text: *const u16, caption: *const u16, utype: u32) -> i32;
    }

    let to_wide = |s: &str| -> Vec<u16> {
        OsStr::new(s).encode_wide().chain(std::iter::once(0)).collect()
    };
    let text = to_wide(msg);
    let caption = to_wide("工资秒表 - 启动失败");
    // MB_OK | MB_ICONERROR | MB_TOPMOST
    unsafe {
        MessageBoxW(
            std::ptr::null_mut(),
            text.as_ptr(),
            caption.as_ptr(),
            0x0 | 0x10 | 0x40000,
        );
    }
}

#[cfg(not(target_os = "windows"))]
fn show_error_dialog(msg: &str) {
    eprintln!("{}", msg);
}

fn main() {
    // 捕获 panic，把内部错误转成对用户可读的提示
    panic::set_hook(Box::new(|info| {
        let detail = if let Some(s) = info.payload().downcast_ref::<&str>() {
            s.to_string()
        } else if let Some(s) = info.payload().downcast_ref::<String>() {
            s.clone()
        } else {
            "未知错误".to_string()
        };

        let msg = format!(
            "工资秒表启动失败。\n\n技术原因：\n{}\n\n\
             【常见解决办法】\n\
             1. 右键此程序 → 以管理员身份运行\n\
             2. 安装/修复 WebView2 运行时：\n\
                搜索 “Microsoft Edge WebView2 Runtime” 下载安装\n\
             3. 如果安装了杀毒软件，请将该程序加入白名单\n\n\
             也可以直接双击 index.html 用浏览器打开使用（功能完全相同）。",
            detail
        );
        show_error_dialog(&msg);
    }));

    if let Err(e) = tauri::Builder::default().run(tauri::generate_context!()) {
        let msg = format!(
            "工资秒表启动失败。\n\n技术原因：\n{}\n\n\
             【常见解决办法】\n\
             1. 右键此程序 → 以管理员身份运行\n\
             2. 安装/修复 WebView2 运行时\n\
             3. 或将程序加入杀毒软件白名单\n\n\
             也可以直接双击 index.html 用浏览器打开使用。",
            e
        );
        show_error_dialog(&msg);
        std::process::exit(1);
    }
}
