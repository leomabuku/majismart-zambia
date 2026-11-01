package com.majismart.zambia

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.animation.*
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.majismart.zambia.auth.AuthManager
import com.majismart.zambia.data.model.*
import com.majismart.zambia.data.remote.MajiSmartApiService
import com.majismart.zambia.notifications.NotificationHelper
import com.majismart.zambia.ui.components.GoogleSignInHeader
import com.majismart.zambia.ui.screens.*
import com.majismart.zambia.ui.theme.*
import com.majismart.zambia.ui.components.BrandMark
import kotlinx.coroutines.launch
import kotlinx.coroutines.delay
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.sync.Mutex
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.repeatOnLifecycle
import androidx.lifecycle.compose.LocalLifecycleOwner

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        // Restore any stored session before the first request is built.
        AuthManager.init(this)
        val api = MajiSmartApiService.create()
        setContent {
            MajiSmartTheme {
                AuthGate(api)
            }
        }
    }
}

/**
 * Nothing renders until we know who is signed in: a stored token is confirmed
 * with /api/auth/me, then the app shows either the login screen or the
 * dashboard. Signing out returns here automatically.
 */
@Composable
fun AuthGate(api: MajiSmartApiService) {
    val user = AuthManager.currentUser
    val restoring = AuthManager.isRestoring

    LaunchedEffect(Unit) {
        AuthManager.validateSession(api)
    }

    when {
        restoring && user == null -> SplashScreen()
        user == null -> LoginScreen(api)
        else -> MainAppScreen(api)
    }
}

@Composable
fun SplashScreen() {
    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(MajiNavy),
        contentAlignment = Alignment.Center
    ) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            BrandMark(Modifier.size(64.dp))
            Spacer(Modifier.height(14.dp))
            Text("SmartWater Zambia", color = Color.White, fontSize = 20.sp, fontWeight = FontWeight.Bold)
            Spacer(Modifier.height(10.dp))
            CircularProgressIndicator(color = MajiLightBlue, strokeWidth = 2.dp, modifier = Modifier.size(20.dp))
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MainAppScreen(api: MajiSmartApiService) {
    var selectedTab by remember { mutableStateOf(0) }
    val scope = rememberCoroutineScope()

    val context = androidx.compose.ui.platform.LocalContext.current
    var tanks by remember { mutableStateOf<List<Tank>>(emptyList()) }
    var reports by remember { mutableStateOf<List<CommunityReport>>(emptyList()) }
    var isLoading by remember { mutableStateOf(false) }
    var connectionError by remember { mutableStateOf<String?>(null) }
    var lastSyncedAt by remember { mutableStateOf<String?>(null) }
    val refreshMutex = remember { Mutex() }
    val lifecycleOwner = LocalLifecycleOwner.current
    val wideScreen = LocalConfiguration.current.screenWidthDp >= 600
    var reportsSyncedAt by remember { mutableLongStateOf(0L) }

    val notifications = NotificationHelper.notifications
    val unreadNotifCount = NotificationHelper.getUnreadCount()

    suspend fun loadData(manual: Boolean = false) {
        // Manual refresh and periodic refresh must never overlap or race.
        if (!refreshMutex.tryLock()) return
        isLoading = manual || lastSyncedAt == null
        try {
            val tankRes = if (AuthManager.currentUser?.role in listOf("admin", "super_admin")) api.getAllTanks() else api.getTanks()
            val tankData = tankRes.body()?.data
            if (!tankRes.isSuccessful || tankData == null) {
                connectionError = "Unable to refresh tank data. Showing last-known information."
                return
            }
            tanks = tankData
            lastSyncedAt = java.text.DateFormat.getDateTimeInstance().format(java.util.Date())
            connectionError = null
            if (manual || android.os.SystemClock.elapsedRealtime() - reportsSyncedAt >= 15_000L || reportsSyncedAt == 0L) {
            val repRes = api.getReports()
            if (repRes.isSuccessful && repRes.body()?.data != null) {
                reports = repRes.body()!!.data!!
                reportsSyncedAt = android.os.SystemClock.elapsedRealtime()
            } else {
                connectionError = "Tank data refreshed, but reports could not be refreshed."
            }
            }
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            connectionError = "Connection unavailable. Showing last-known information."
        } finally {
            isLoading = false
            refreshMutex.unlock()
        }
    }

    fun refreshData() { scope.launch { loadData(manual = true) } }

    // Refresh while the screen is visible; this is polling, not live SSE.
    LaunchedEffect(lifecycleOwner) {
        lifecycleOwner.lifecycle.repeatOnLifecycle(Lifecycle.State.STARTED) {
            while (true) {
                loadData()
                delay(1_000)
            }
        }
    }

    Scaffold(
        topBar = {
            GoogleSignInHeader(
                onOpenNotifications = { selectedTab = 4 },
                unreadNotificationsCount = unreadNotifCount,
                onSignOut = {
                    scope.launch { AuthManager.signOut(api, context) }
                }
            )
        },
        bottomBar = {
            if (!wideScreen) {
                NavigationBar(containerColor = Color.White) {
                    AppDestinations.forEachIndexed { index, destination ->
                        NavigationBarItem(
                            selected = selectedTab == index,
                            onClick = { selectedTab = index },
                            icon = { Icon(destination.second, contentDescription = destination.first) },
                            label = { Text(destination.first, fontSize = 14.sp) },
                            alwaysShowLabel = false
                        )
                    }
                }
            }
        }
    ) { paddingValues ->
        Row(Modifier.fillMaxSize().padding(paddingValues).background(MajiBackground)) {
            if (wideScreen) {
                NavigationRail(containerColor = Color.White) {
                    AppDestinations.forEachIndexed { index, destination ->
                        NavigationRailItem(
                            selected = selectedTab == index,
                            onClick = { selectedTab = index },
                            icon = { Icon(destination.second, contentDescription = destination.first) },
                            label = { Text(destination.first) }
                        )
                    }
                }
            }
            Box(Modifier.weight(1f).fillMaxHeight(), contentAlignment = Alignment.TopCenter) {
            Box(Modifier.widthIn(max = 960.dp).fillMaxSize()) {
            when (selectedTab) {
                0 -> HomeScreen(
                    tanks = tanks,
                    isLoading = isLoading,
                    connectionError = connectionError,
                    lastSyncedAt = lastSyncedAt,
                    onRefresh = { refreshData() },
                    onNavigateToReport = { selectedTab = 2 }
                )
                1 -> LiveMapScreen(
                    tanks = tanks,
                    reports = reports,
                    onNavigateToReport = { selectedTab = 2 }
                )
                2 -> SubmitReportScreen(
                    api = api,
                    onReportSubmitted = {
                        refreshData()
                        selectedTab = 3
                    }
                )
                3 -> MyReportsScreen(
                    reports = reports,
                    onRefresh = { refreshData() }
                )
                4 -> NotificationsScreen(
                    notifications = notifications,
                    onMarkAllRead = { NotificationHelper.markAllAsRead() }
                )
            }
        }
    }
    }
    }
}

private val AppDestinations = listOf(
    "Levels" to Icons.Default.WaterDrop,
    "Map" to Icons.Default.Map,
    "Report" to Icons.Default.ReportProblem,
    "History" to Icons.Default.ListAlt,
    "Alerts" to Icons.Default.Notifications
)
