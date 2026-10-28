package com.majismart.zambia.data.remote

import com.majismart.zambia.BuildConfig
import com.majismart.zambia.data.model.*
import retrofit2.Response
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory
import retrofit2.http.*

interface MajiSmartApiService {

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
        private const val BASE_URL = BuildConfig.API_BASE_URL

        fun create(): MajiSmartApiService {
            return Retrofit.Builder()
                .baseUrl(BASE_URL)
                .addConverterFactory(GsonConverterFactory.create())
                .build()
                .create(MajiSmartApiService::class.java)
        }
    }
}
