plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

// The web app in the repository root is the single source of truth. Its three files are
// copied into the APK's assets on every build, so the phone app and the website cannot
// drift apart and nothing is kept twice in git.
val webAssets = layout.buildDirectory.dir("generated/webAssets")
val copyWebApp = tasks.register<Copy>("copyWebApp") {
    from(rootProject.projectDir.parentFile) {
        include("index.html", "style.css", "script.js")
    }
    into(webAssets)
}

android {
    namespace = "com.lumidren.maatora"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.lumidren.maatora"
        minSdk = 29
        // 34 keeps the system status bar outside the page; 35 would draw the page under it.
        targetSdk = 34
        versionCode = 1
        versionName = "1.0.0"
    }

    sourceSets["main"].assets.srcDir(webAssets)

    buildTypes {
        release {
            isMinifyEnabled = false
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = "17"
    }
}

tasks.named("preBuild") {
    dependsOn(copyWebApp)
}
