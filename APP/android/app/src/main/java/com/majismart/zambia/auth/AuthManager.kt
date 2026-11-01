package com.majismart.zambia.auth

import android.content.Context
import android.content.SharedPreferences
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import com.google.gson.Gson
import com.majismart.zambia.BuildConfig
import com.majismart.zambia.data.model.AuthUser
import com.majismart.zambia.data.model.GoogleLoginRequest
import com.majismart.zambia.data.model.LoginRequest
import com.majismart.zambia.data.remote.MajiSmartApiService
import com.google.android.gms.auth.api.signin.GoogleSignIn
import com.google.android.gms.auth.api.signin.GoogleSignInClient
import com.google.android.gms.auth.api.signin.GoogleSignInOptions

/**
 * Single source of truth for the mobile session.
 *
 * The API issues a stateless JWT (same one the web dashboard receives), so the
 * app stores it locally, attaches it to every request and drops it on sign-out.
 * Nothing here trusts an email address: Google sign-in sends the signed ID token
 * to POST /api/auth/google and the backend decides who the user is.
 */
object AuthManager {

    private const val PREFS_NAME = "majismart_auth"
    private const val KEY_TOKEN = "token"
    private const val KEY_USER = "user"

    private var prefs: SharedPreferences? = null
    private val gson = Gson()

    @Volatile
    var authToken: String? = null
        private set

    /** Compose-observable current user; null means "signed out". */
    var currentUser by mutableStateOf<AuthUser?>(null)
        private set

    var isRestoring by mutableStateOf(true)
        private set

    fun init(context: Context) {
        if (prefs != null) return
        val store = context.applicationContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        prefs = store
        authToken = store.getString(KEY_TOKEN, null)
        currentUser = store.getString(KEY_USER, null)?.let {
            runCatching { gson.fromJson(it, AuthUser::class.java) }.getOrNull()
        }
        isRestoring = authToken == null
    }

    val isSignedIn: Boolean get() = authToken != null && currentUser != null

    /**
     * Confirms a restored token with the API. A rejected token signs the user
     * out; a cold-starting free-tier server keeps the cached profile.
     */
    suspend fun validateSession(api: MajiSmartApiService) {
        if (authToken == null) {
            isRestoring = false
            return
        }
        try {
            val response = api.me()
            val body = response.body()
            val user = body?.user
            val token = authToken
            if (response.isSuccessful && body?.success == true && user != null && token != null) {
                persist(token, user)
            } else if (response.code() == 401 || response.code() == 403) {
                clearSession()
            }
        } catch (_: Exception) {
            // Offline or sleeping free instance: keep the cached session.
        } finally {
            isRestoring = false
        }
    }

    suspend fun signInWithPassword(api: MajiSmartApiService, email: String, password: String): Result<AuthUser> {
        return try {
            val response = api.login(LoginRequest(email.trim(), password))
            exchange(response.code(), response.body())
        } catch (e: Exception) {
            Result.failure(Exception("Cannot reach the SmartWater API. Check your connection."))
        }
    }

    suspend fun signInWithGoogle(api: MajiSmartApiService, idToken: String): Result<AuthUser> {
        return try {
            val response = api.loginWithGoogle(GoogleLoginRequest(idToken))
            exchange(response.code(), response.body())
        } catch (e: Exception) {
            Result.failure(Exception("Cannot reach the SmartWater API. Check your connection."))
        }
    }

    private fun exchange(code: Int, body: com.majismart.zambia.data.model.AuthResponse?): Result<AuthUser> {
        val user = body?.user
        val token = body?.token
        if (body?.success == true && user != null && token != null) {
            persist(token, user)
            return Result.success(user)
        }
        val message = body?.error ?: when (code) {
            401, 403 -> "Those details were not accepted."
            in 500..599 -> "The SmartWater API is unavailable right now. Try again shortly."
            else -> "Sign-in failed."
        }
        return Result.failure(Exception(message))
    }

    private fun persist(token: String, user: AuthUser) {
        authToken = token
        currentUser = user
        prefs?.edit()?.putString(KEY_TOKEN, token)?.putString(KEY_USER, gson.toJson(user))?.apply()
    }

    /** Server is told for the audit trail; the local token is what actually ends the session. */
    suspend fun signOut(api: MajiSmartApiService?, context: Context?) {
        if (api != null) {
            runCatching { api.logout() }
        }
        context?.let {
            runCatching { googleClient(it).signOut() }
        }
        clearSession()
    }

    private fun clearSession() {
        authToken = null
        currentUser = null
        prefs?.edit()?.remove(KEY_TOKEN)?.remove(KEY_USER)?.apply()
    }

    // --- Google Sign-In ------------------------------------------------------

    /**
     * The "server client id" is the *Web* OAuth client from Google Cloud Console
     * (BuildConfig.GOOGLE_WEB_CLIENT_ID). Requesting an ID token against it makes
     * Google issue a JWT whose audience the backend already trusts.
     */
    fun googleClient(context: Context): GoogleSignInClient {
        val options = GoogleSignInOptions.Builder(GoogleSignInOptions.DEFAULT_SIGN_IN)
            .requestIdToken(BuildConfig.GOOGLE_WEB_CLIENT_ID)
            .requestEmail()
            .build()
        return GoogleSignIn.getClient(context, options)
    }

    fun isGoogleConfigured(): Boolean =
        BuildConfig.GOOGLE_WEB_CLIENT_ID.isNotBlank() && !BuildConfig.GOOGLE_WEB_CLIENT_ID.startsWith("YOUR_")
}
