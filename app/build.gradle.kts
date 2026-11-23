plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    // Change the applicationId before your first Play upload. It can never change afterwards.
    namespace = "de.berlinroute.app"
    compileSdk = 35

    defaultConfig {
        applicationId = "de.bearline.app"
        minSdk = 26
        targetSdk = 35
        versionCode = 3
        versionName = "0.6.0"
    }

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

dependencies {
    implementation("androidx.core:core-ktx:1.13.1")
    implementation("androidx.appcompat:appcompat:1.7.0")
    implementation("androidx.webkit:webkit:1.12.1")
}
