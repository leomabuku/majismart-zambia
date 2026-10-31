plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.kotlin.compose)
}

android {
    namespace = "com.majismart.zambia"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.majismart.zambia"
        minSdk = 24
        targetSdk = 35
        versionCode = 1
        versionName = "1.0.0"
        // Shared backend. Override per build, e.g.:
        //   ./gradlew assembleDebug -PapiBaseUrl=http://10.0.2.2:5000/
        //   ./gradlew assembleRelease -PapiBaseUrl=https://majismart-api.onrender.com/
        // Defaults to the deployed Render service; falls back to the emulator loopback.
        buildConfigField(
            "String",
            "API_BASE_URL",
            "\"${project.findProperty("apiBaseUrl") ?: "https://majismart-api.onrender.com/"}\""
        )
        // Web OAuth client id from Google Cloud Console. Used as the "server client id"
        // for Google Sign-In so the ID token audience matches the API allow-list,
        // and inlined into the web dashboard build the same way.
        // A Google OAuth *client id* is public (it ships inside the APK by design;
        // the protection is the package name + SHA-1 pairing in Google Cloud).
        // The project default lets a fresh clone sign in with Google without any
        // Gradle flags; override with -PgoogleWebClientId=... to use another client.
        val googleClientIdProperty = project.findProperty("googleWebClientId") as String?
        buildConfigField(
            "String",
            "GOOGLE_WEB_CLIENT_ID",
            "\"${googleClientIdProperty ?: "66951276979-66l1j0kdakebc5hnjfjujb8ua2th125u.apps.googleusercontent.com"}\""
        )
        manifestPlaceholders["MAPS_API_KEY"] = project.findProperty("mapsApiKey") ?: "YOUR_GOOGLE_MAPS_API_KEY"

        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
        vectorDrawables {
            useSupportLibrary = true
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = "17"
    }
    buildFeatures {
        compose = true
        buildConfig = true
    }
    composeOptions {
        kotlinCompilerExtensionVersion = "1.5.8"
    }
    packaging {
        resources {
            excludes += "/META-INF/{AL2.0,LGPL2.1}"
        }
    }
}

dependencies {
    implementation("androidx.core:core-ktx:1.13.1")
    implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.8.4")
    implementation("androidx.activity:activity-compose:1.9.1")
    
    // Jetpack Compose & Material 3
    implementation(platform("androidx.compose:compose-bom:2024.08.00"))
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.ui:ui-graphics")
    implementation("androidx.compose.ui:ui-tooling-preview")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.compose.material:material-icons-extended")
    implementation("androidx.navigation:navigation-compose:2.7.7")

    // Retrofit & Networking for Shared Backend API
    implementation("com.squareup.retrofit2:retrofit:2.11.0")
    implementation("com.squareup.retrofit2:converter-gson:2.11.0")
    implementation("com.squareup.okhttp3:logging-interceptor:4.12.0")

    // Coroutines
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.8.1")
    implementation("androidx.lifecycle:lifecycle-viewmodel-compose:2.8.4")

    // Google Maps & Location
    implementation("com.google.maps.android:maps-compose:4.3.3")
    implementation("com.google.android.gms:play-services-maps:19.0.0")
    implementation("com.google.android.gms:play-services-location:21.3.0")

    // Google Sign-In / Auth
    implementation("com.google.android.gms:play-services-auth:21.2.0")

    // Coil Image Loading
    implementation("io.coil-kt:coil-compose:2.6.0")
}
