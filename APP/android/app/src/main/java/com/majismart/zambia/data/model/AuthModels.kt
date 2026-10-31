package com.majismart.zambia.data.model

import com.google.gson.annotations.SerializedName

/**
 * Signed-in MajiSmart user, as returned by /api/auth/login, /api/auth/google
 * and /api/auth/me. Mirrors the backend `profiles` row (never a password hash).
 */
data class AuthUser(
    @SerializedName("id") val id: String = "",
    @SerializedName("email") val email: String = "",
    @SerializedName("full_name") val fullName: String = "",
    @SerializedName("role") val role: String = "customer",
    @SerializedName("phone_number") val phoneNumber: String? = null,
    @SerializedName("community") val community: String? = null,
    @SerializedName("district") val district: String? = null,
    @SerializedName("avatar_url") val avatarUrl: String? = null,
    @SerializedName("auth_provider") val authProvider: String? = null
) {
    val initials: String
        get() = fullName.trim()
            .split(" ")
            .filter { it.isNotBlank() }
            .take(2)
            .joinToString("") { it.first().uppercase() }
            .ifBlank { email.take(1).uppercase() }

    val roleLabel: String
        get() = when (role.lowercase()) {
            "admin" -> "Administrator"
            "technician" -> "Technician"
            else -> "Community member"
        }
}

/** Shared response envelope for the auth endpoints. */
data class AuthResponse(
    @SerializedName("success") val success: Boolean = false,
    @SerializedName("message") val message: String? = null,
    @SerializedName("token") val token: String? = null,
    @SerializedName("user") val user: AuthUser? = null,
    @SerializedName("error") val error: String? = null
)

data class LoginRequest(
    @SerializedName("email") val email: String,
    @SerializedName("password") val password: String
)

/** Google ID token (JWT) obtained from Google Sign-In, verified server side. */
data class GoogleLoginRequest(
    @SerializedName("credential") val credential: String
)
