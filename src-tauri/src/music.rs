use serde_json::{json, Value};

#[tauri::command]
pub fn set_lyric_bubble(window: tauri::WebviewWindow, text: String) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        use std::ffi::{c_char, c_void, CString};
        extern "C" {
            fn kuro_set_lyric_bubble(pet: *mut c_void, text: *const c_char);
        }
        let lyric = CString::new(text.replace('\0', "")).map_err(|e| e.to_string())?;
        let pet = window.clone();
        return window.run_on_main_thread(move || {
            if let Ok(native) = pet.ns_window() {
                unsafe { kuro_set_lyric_bubble(native, lyric.as_ptr()) }
            }
        }).map_err(|e| e.to_string());
    }
    #[cfg(not(target_os = "macos"))]
    { let _ = (window, text); Ok(()) }
}

#[tauri::command]
pub async fn netease_playback() -> Result<Value, String> {
    #[cfg(target_os = "macos")]
    {
        return tauri::async_runtime::spawn_blocking(|| {
            use std::ffi::{c_char, CStr};
            extern "C" {
                fn kuro_netease_snapshot() -> *mut c_char;
                fn kuro_free_snapshot(value: *mut c_char);
            }
            unsafe {
                let snapshot = kuro_netease_snapshot();
                if snapshot.is_null() {
                    return Err("读取播放栏失败".to_string());
                }
                let result = serde_json::from_slice(CStr::from_ptr(snapshot).to_bytes());
                kuro_free_snapshot(snapshot);
                result.map_err(|e| e.to_string())
            }
        })
        .await
        .map_err(|e| e.to_string())?;
    }
    #[cfg(not(target_os = "macos"))]
    Ok(json!({}))
}

#[cfg(target_os = "macos")]
fn netease_get(path: &str, params: &[(&str, String)]) -> Result<Value, String> {
    let mut cmd = std::process::Command::new("/usr/bin/curl");
    cmd.args(["-q", "--fail", "--silent", "--show-error", "--max-time", "7", "--get"]);
    for (key, value) in params {
        cmd.arg("--data-urlencode").arg(format!("{key}={value}"));
    }
    let response = cmd.arg(format!("https://music.163.com/api/{path}")).output().map_err(|e| e.to_string())?;
    if !response.status.success() { return Err("网易云歌词暂时无法连接".into()); }
    let data: Value = serde_json::from_slice(&response.stdout).map_err(|e| e.to_string())?;
    if data["code"].as_i64() != Some(200) { return Err("网易云歌词暂时无法读取".into()); }
    Ok(data)
}

#[cfg(target_os = "macos")]
fn lookup(title: String, artist: String, duration: f64) -> Result<Value, String> {
    fn normalize(s: &str) -> String {
        s.split_whitespace().collect::<String>().to_lowercase()
    }

    let primary_artist = artist.split(" / ").next().unwrap_or("");
    let result = netease_get("search/get", &[
        ("s", format!("{title} {primary_artist}")),
        ("type", "1".into()),
        ("limit", "20".into()),
    ])?;
    let artists: Vec<_> = artist.split(" / ").map(normalize).collect();
    let wanted_title = normalize(&title);
    let mut best: Option<(u64, i64)> = None;
    for song in result["result"]["songs"].as_array().into_iter().flatten() {
        if normalize(song["name"].as_str().unwrap_or_default()) != wanted_title {
            continue;
        }
        let artist_matches = song["artists"].as_array().into_iter().flatten().any(|a| {
            artists.contains(&normalize(a["name"].as_str().unwrap_or_default()))
        });
        if !artist_matches {
            continue;
        }
        let Some(ms) = song["duration"].as_i64() else { continue };
        let Some(id) = song["id"].as_i64() else { continue };
        let diff = ms.abs_diff((duration * 1000.0).round() as i64);
        if diff <= 3000 && best.is_none_or(|(previous, _)| diff < previous) {
            best = Some((diff, id));
        }
    }

    let Some((_, id)) = best else { return Ok(json!({})) };
    let lyrics = netease_get("song/lyric", &[
        ("id", id.to_string()),
        ("lv", "-1".into()),
        ("yv", "-1".into()),
    ])?;
    Ok(json!({
        "lrc": lyrics["lrc"]["lyric"],
        "yrc": lyrics["yrc"]["lyric"],
        "instrumental": lyrics["nolyric"] == true,
    }))
}

#[tauri::command]
pub async fn netease_lyrics(title: String, artist: String, duration: f64) -> Result<Value, String> {
    #[cfg(target_os = "macos")]
    return tauri::async_runtime::spawn_blocking(move || lookup(title, artist, duration)).await.map_err(|e| e.to_string())?;
    #[cfg(not(target_os = "macos"))]
    Ok(json!({}))
}
