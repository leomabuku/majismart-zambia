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
import kotlinx.coroutines.launch

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
            Surface(shape = RoundedCornerShape(20.dp), color = Color.White, modifier = Modifier.size(64.dp)) {
                Box(contentAlignment = Alignment.Center) {
                    Icon(
                        Icons.Default.WaterDrop,
                        contentDescription = null,
                        tint = MajiOceanBlue,
                        modifier = Modifier.size(32.dp)
                    )
                }
            }
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

    val notifications = NotificationHelper.notifications
    val unreadNotifCount = NotificationHelper.getUnreadCount()

    fun refreshData() {
        scope.launch {
            isLoading = true
            try {
                val tankRes = api.getTanks()
                if (tankRes.isSuccessful && tankRes.body()?.data != null) {
                    tanks = tankRes.body()!!.data!!
                } else {
                    tanks = emptyList()
                }

                val repRes = api.getReports()
                if (repRes.isSuccessful && repRes.body()?.data != null) {
                    reports = repRes.body()!!.data!!
                } else {
                    reports = emptyList()
                }
            } catch (e: Exception) {
                // Keep last-known records on connection failure; do not fabricate readings.
            } finally {
                isLoading = false
            }
        }
    }

    LaunchedEffect(Unit) {
        refreshData()
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
            NavigationBar(
                containerColor = Color.White,
                tonalElevation = 8.dp
            ) {
                NavigationBarItem(
                    selected = selectedTab == 0,
                    onClick = { selectedTab = 0 },
                    icon = { Icon(Icons.Default.WaterDrop, contentDescription = null) },
                    label = { Text("Levels", fontSize = 11.sp, fontWeight = FontWeight.Bold) },
                    colors = NavigationBarItemDefaults.colors(selectedIconColor = MajiOceanBlue, indicatorColor = MajiSoftBlue)
                )
                NavigationBarItem(
                    selected = selectedTab == 1,
                    onClick = { selectedTab = 1 },
                    icon = { Icon(Icons.Default.Map, contentDescription = null) },
                    label = { Text("Live Map", fontSize = 11.sp, fontWeight = FontWeight.Bold) },
                    colors = NavigationBarItemDefaults.colors(selectedIconColor = MajiOceanBlue, indicatorColor = MajiSoftBlue)
                )
                NavigationBarItem(
                    selected = selectedTab == 2,
                    onClick = { selectedTab = 2 },
                    icon = { Icon(Icons.Default.ReportProblem, contentDescription = null) },
                    label = { Text("Report Issue", fontSize = 11.sp, fontWeight = FontWeight.Bold) },
                    colors = NavigationBarItemDefaults.colors(selectedIconColor = MajiRed, indicatorColor = MajiRedLight)
                )
                NavigationBarItem(
                    selected = selectedTab == 3,
                    onClick = { selectedTab = 3 },
                    icon = { Icon(Icons.Default.ListAlt, contentDescription = null) },
                    label = { Text("My Reports", fontSize = 11.sp, fontWeight = FontWeight.Bold) },
                    colors = NavigationBarItemDefaults.colors(selectedIconColor = MajiOceanBlue, indicatorColor = MajiSoftBlue)
                )
                NavigationBarItem(
                    selected = selectedTab == 4,
                    onClick = { selectedTab = 4 },
                    icon = {
                        BadgedBox(
                            badge = {
                                if (unreadNotifCount > 0) {
                                    Badge(containerColor = MajiRed) {
                                        Text(unreadNotifCount.toString())
                                    }
                                }
                            }
                        ) {
                            Icon(Icons.Default.Notifications, contentDescription = null)
                        }
                    },
                    label = { Text("Alerts", fontSize = 11.sp, fontWeight = FontWeight.Bold) },
                    colors = NavigationBarItemDefaults.colors(selectedIconColor = MajiOceanBlue, indicatorColor = MajiSoftBlue)
                )
            }
        }
    ) { paddingValues ->
        Box(
            modifier = Modifier
                .fillMaxSize()
                .padding(paddingValues)
                .background(MajiBackground)
        ) {
            when (selectedTab) {
                0 -> HomeScreen(
                    tanks = tanks,
                    isLoading = isLoading,
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
