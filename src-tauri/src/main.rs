// Tauri 入口：打开窗口加载本地页面。
//
// 两个关键点：
// 1. 单实例保护。WebView2 的用户数据目录（%LOCALAPPDATA%\<identifier>\EBWebView）
//    同一时刻只允许一个进程初始化。用户连点两下图标、或上一个实例还没退干净时，
//    第二个进程会拿到 HRESULT(0x800700AA)（ERROR_BUSY，“请求的资源在使用中”），
//    表现就是打开后弹一个“启动失败”的框。这里用命名互斥体挡住第二个实例，
//    并把已有窗口提到前台，用户看到的就是“窗口弹出来了”而不是报错。
// 2. 启动失败（如 WebView2 运行时缺失）时不要静默闪退，而是弹窗给出可读的解决办法。
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::panic;

// ---------------------------------------------------------------- 单实例保护

#[cfg(target_os = "windows")]
mod single_instance {
    use std::ffi::OsStr;
    use std::os::windows::ffi::OsStrExt;
    use std::ptr;

    #[link(name = "kernel32")]
    extern "system" {
        fn CreateMutexW(
            attrs: *mut core::ffi::c_void,
            initial_owner: i32,
            name: *const u16,
        ) -> *mut core::ffi::c_void;
        fn GetLastError() -> u32;
    }

    #[link(name = "user32")]
    extern "system" {
        fn FindWindowW(class: *const u16, title: *const u16) -> *mut core::ffi::c_void;
        fn ShowWindow(hwnd: *mut core::ffi::c_void, cmd: i32) -> i32;
        fn SetForegroundWindow(hwnd: *mut core::ffi::c_void) -> i32;
        fn IsIconic(hwnd: *mut core::ffi::c_void) -> i32;
    }

    const ERROR_ALREADY_EXISTS: u32 = 183;
    const SW_RESTORE: i32 = 9;

    fn wide(s: &str) -> Vec<u16> {
        OsStr::new(s).encode_wide().chain(std::iter::once(0)).collect()
    }

    fn focus(title: &str) -> bool {
        let t = wide(title);
        unsafe {
            let hwnd = FindWindowW(ptr::null(), t.as_ptr());
            if hwnd.is_null() {
                return false;
            }
            if IsIconic(hwnd) != 0 {
                ShowWindow(hwnd, SW_RESTORE);
            }
            SetForegroundWindow(hwnd);
            true
        }
    }

    /// 返回 `true` 表示已经有实例在运行，调用方应直接退出。
    ///
    /// 互斥体句柄故意不关闭：进程结束时 Windows 会自动释放，语义上正好等于
    /// “本进程存活期间独占”。
    pub fn already_running(app_id: &str, window_titles: &[&str]) -> bool {
        let name = wide(&format!("Local\\{}-single-instance", app_id));
        unsafe {
            let handle = CreateMutexW(ptr::null_mut(), 0, name.as_ptr());
            // 创建失败时放行：宁可多开一次，也不要因为单实例检查把程序挡死
            if handle.is_null() || GetLastError() != ERROR_ALREADY_EXISTS {
                return false;
            }
        }

        // 已有实例：把它的窗口提到前台。窗口可能还在创建中，轮询等一下。
        for _ in 0..20 {
            for title in window_titles {
                if focus(title) {
                    return true;
                }
            }
            std::thread::sleep(std::time::Duration::from_millis(150));
        }
        true
    }
}

// ---------------------------------------------------------------- 错误弹窗

#[cfg(target_os = "windows")]
fn show_error_dialog(msg: &str) {
    use std::ffi::OsStr;
    use std::os::windows::ffi::OsStrExt;

    #[link(name = "user32")]
    extern "system" {
        fn MessageBoxW(
            hwnd: *mut core::ffi::c_void,
            text: *const u16,
            caption: *const u16,
            utype: u32,
        ) -> i32;
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

/// 把底层报错翻译成“用户照着做就能好”的建议。
fn advice_for(detail: &str) -> &'static str {
    let d = detail.to_ascii_uppercase();
    if d.contains("0X800700AA") || d.contains("在使用中") || d.contains("IN USE") {
        "原因：已经有一个「工资秒表」在运行（或上次的 WebView2 进程还没退干净），\n\
         两个实例不能同时使用同一份 WebView2 数据目录。\n\n\
         1. 先在任务栏里找找是不是已经打开了，直接用它即可\n\
         2. 如果看不到窗口：打开任务管理器，结束所有“工资秒表 / SalaryTicker /\n\
            msedgewebview2”进程，再重新打开\n\
         3. 仍然不行就重启电脑一次"
    } else if d.contains("0X80010108") || d.contains("0X8001010D") {
        "原因：WebView2 子进程被系统或安全软件中断了。\n\n\
         1. 把程序所在文件夹加入 Windows 安全中心 / 杀毒软件的排除项\n\
         2. 右键此程序 → 以管理员身份运行"
    } else if d.contains("WEBVIEW2") {
        "原因：系统里的 Microsoft Edge WebView2 运行时缺失或损坏。\n\n\
         1. 搜索 “Microsoft Edge WebView2 Runtime”，下载“常青版独立安装程序”安装\n\
         2. 或安装 Windows 更新后重试"
    } else {
        "1. 右键此程序 → 以管理员身份运行\n\
         2. 安装/修复 WebView2 运行时：\n\
            搜索 “Microsoft Edge WebView2 Runtime” 下载安装\n\
         3. 如果安装了杀毒软件，请将该程序加入白名单"
    }
}

fn fatal(detail: &str) {
    let msg = format!(
        "工资秒表启动失败。\n\n技术原因：\n{}\n\n【常见解决办法】\n{}\n\n\
         也可以直接双击 index.html 用浏览器打开使用（功能完全相同）。",
        detail,
        advice_for(detail)
    );
    show_error_dialog(&msg);
}

fn main() {
    // 单实例：挡住第二个进程，避免它去抢同一份 WebView2 数据目录而报 0x800700AA
    #[cfg(target_os = "windows")]
    if single_instance::already_running(
        "com.salaryticker.desktop",
        &["工资秒表", "工资秒表 - 启动失败"],
    ) {
        return;
    }

    // 捕获 panic，把内部错误转成对用户可读的提示
    panic::set_hook(Box::new(|info| {
        let detail = if let Some(s) = info.payload().downcast_ref::<&str>() {
            s.to_string()
        } else if let Some(s) = info.payload().downcast_ref::<String>() {
            s.clone()
        } else {
            "未知错误".to_string()
        };
        fatal(&detail);
    }));

    if let Err(e) = tauri::Builder::default().run(tauri::generate_context!()) {
        fatal(&e.to_string());
        std::process::exit(1);
    }
}
