package com.majismart.zambia.data.remote

import com.majismart.zambia.BuildConfig
import com.majismart.zambia.auth.AuthManager
import com.majismart.zambia.data.model.*
import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.Response
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory
import retrofit2.http.*
import java.util.concurrent.TimeUnit

interface MajiSmartApiService {

    // --- Authentication (shared with the web dashboard) ---------------------
    @GET("api/health")
    suspend fun health(): Response<Map<String, Any>>

    @POST("api/auth/login")
    suspend fun login(@Body request: LoginRequest): Response<AuthResponse>

    @POST("api/auth/google")
    suspend fun loginWithGoogle(@Body request: GoogleLoginRequest): Response<AuthResponse>

    @GET("api/auth/me")
    suspend fun me(): Response<AuthResponse>

    @POST("api/auth/logout")
    suspend fun logout(): Response<AuthResponse>

    @GET("api/dashboard/summary")
    suspend fun getSummary(): Response<SummaryResponse>

    @GET("api/tanks")
    suspend fun getTanks(): Response<ApiResponse<List<Tank>>>

    @GET("api/tanks/{id}")
    suspend fun getTankById(@Path("id") id: String): Response<ApiResponse<Tank>>

    @GET("api/reports")
    suspend fun getReports(): Response<ApiResponse<List<CommunityReport>>>

    @POST("api/reports")
    suspend fun submitReport(@Body request: CreateReportRequest): Response<ApiResponse<CommunityReport>>

    companion object {
        // Retrofit requires a trailing slash. The Gradle property is normalised here so
        // `-PapiBaseUrl=https://host` and `-PapiBaseUrl=https://host/` both work.
        private val BASE_URL: String = BuildConfig.API_BASE_URL.let {
            if (it.endsWith("/")) it else "$it/"
        }

        /**
         * The API is deployed on a free instance that sleeps when idle, so the first
         * request after a quiet period can take 30-60 seconds while the container
         * boots. The default OkHttp connect/read timeouts (10 s) would give up first.
         */
        fun create(): MajiSmartApiService {
            val client = OkHttpClient.Builder()
                .connectTimeout(30, TimeUnit.SECONDS)
                .readTimeout(90, TimeUnit.SECONDS)
                .writeTimeout(30, TimeUnit.SECONDS)
                .retryOnConnectionFailure(true)
                // Every request carries the session JWT once the user signs in,
                // so protected endpoints work exactly as they do on the web.
                .addInterceptor { chain ->
                    val token = AuthManager.authToken
                    val request = if (token.isNullOrBlank()) {
                        chain.request()
                    } else {
                        chain.request().newBuilder()
                            .header("Authorization", "Bearer $token")
                            .build()
                    }
                    chain.proceed(request)
                }
                .apply {
                    if (BuildConfig.DEBUG) {
                        addInterceptor(
                            HttpLoggingInterceptor().setLevel(HttpLoggingInterceptor.Level.BASIC)
                        )
                    }
                }
                .build()

            return Retrofit.Builder()
                .baseUrl(BASE_URL)
                .client(client)
                .addConverterFactory(GsonConverterFactory.create())
                .build()
                .create(MajiSmartApiService::class.java)
        }
    }
}
