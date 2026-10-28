package com.majismart.zambia.auth

import android.content.Context
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import com.google.android.gms.auth.api.signin.GoogleSignIn
import com.google.android.gms.auth.api.signin.GoogleSignInAccount
import com.google.android.gms.auth.api.signin.GoogleSignInClient
import com.google.android.gms.auth.api.signin.GoogleSignInOptions

data class UserProfile(
    val id: String,
    val name: String,
    val email: String,
    val photoUrl: String? = null,
    val isVerifiedInspector: Boolean = true
)

object GoogleAuthManager {
    
    // Default logged in demo profile for immediate demonstration
    val defaultDemoProfile = UserProfile(
        id = "google_user_102938",
        name = "Chileshe Mwape",
        email = "chileshe.mwape@gmail.com",
        photoUrl = "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200",
        isVerifiedInspector = true
    )

    var currentUser by mutableStateOf<UserProfile?>(defaultDemoProfile)
        private set

    fun getGoogleSignInClient(context: Context): GoogleSignInClient {
        val gso = GoogleSignInOptions.Builder(GoogleSignInOptions.DEFAULT_SIGN_IN)
            .requestEmail()
            .requestId()
            .requestProfile()
            .build()
        return GoogleSignIn.getClient(context, gso)
    }

    fun handleSignInResult(account: GoogleSignInAccount) {
        currentUser = UserProfile(
            id = account.id ?: "google_${System.currentTimeMillis()}",
            name = account.displayName ?: "Zambia Water User",
            email = account.email ?: "user@majismart.zm",
            photoUrl = account.photoUrl?.toString() ?: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200",
            isVerifiedInspector = true
        )
    }

    fun signInDemoUser() {
        currentUser = defaultDemoProfile
    }

    fun signOut(context: Context? = null) {
        if (context != null) {
            try {
                getGoogleSignInClient(context).signOut()
            } catch (e: Exception) {
                // Ignore if offline
            }
        }
        currentUser = null
    }

    fun isLoggedIn(): Boolean = currentUser != null
}
