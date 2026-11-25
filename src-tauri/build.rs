fn main() {
    println!("cargo:rerun-if-env-changed=KUROCAT_YY_THUNKS_OBJ");
    println!("cargo:rerun-if-env-changed=KUROCAT_VC_LTL_LIB");
    println!("cargo:rerun-if-env-changed=KUROCAT_WIN7_OLE32_SHIM_OBJ");
    #[cfg(feature = "win7")]
    {
        if let Ok(vc_ltl) = std::env::var("KUROCAT_VC_LTL_LIB") {
            let trimmed = vc_ltl.trim();
            if !trimmed.is_empty() {
                println!("cargo:rustc-link-search=native={}", trimmed);
            }
        }
        if let Ok(shim) = std::env::var("KUROCAT_WIN7_OLE32_SHIM_OBJ") {
            let trimmed = shim.trim();
            if !trimmed.is_empty() {
                println!("cargo:rustc-link-arg-bin=KuroCat={}", trimmed);
            }
        }
        if let Ok(obj) = std::env::var("KUROCAT_YY_THUNKS_OBJ") {
            let trimmed = obj.trim();
            if !trimmed.is_empty() {
                println!("cargo:rustc-link-arg-bin=KuroCat={}", trimmed);
                println!("cargo:rustc-link-arg-bin=KuroCat=/SUBSYSTEM:WINDOWS,6.01");
            }
        }
    }
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("macos") {
        println!("cargo:rerun-if-changed=src/netease.m");
        println!("cargo:rerun-if-changed=src/lyric_bubble.m");
        cc::Build::new().files(["src/netease.m", "src/lyric_bubble.m"]).flag("-fobjc-arc").compile("kuro_netease");
        println!("cargo:rustc-link-lib=framework=ApplicationServices");
        println!("cargo:rustc-link-lib=framework=AppKit");
    }
    tauri_build::build()
}
