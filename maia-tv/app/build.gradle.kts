plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

// The address MAIA is opened at; changeable on the TV too (Menu button).
val maiaUrl = (project.findProperty("maiaUrl") as String?) ?: "http://192.168.1.6:3001"

android {
    namespace = "it.maia.tv"
    compileSdk = 34

    defaultConfig {
        applicationId = "it.maia.tv"
        // Fire OS 5 (first Fire TV Stick) is Android 5.1.
        minSdk = 22
        targetSdk = 34
        versionCode = 4
        versionName = "1.3"
        buildConfigField("String", "MAIA_URL", "\"$maiaUrl\"")
    }

    buildFeatures {
        buildConfig = true
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            // Installed by hand (Downloader/adb), not from a store: the debug key is enough.
            signingConfig = signingConfigs.getByName("debug")
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
