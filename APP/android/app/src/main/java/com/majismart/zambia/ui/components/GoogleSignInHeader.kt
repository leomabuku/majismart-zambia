package com.majismart.zambia.ui.components

import android.app.Activity
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.*
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import com.google.android.gms.auth.api.signin.GoogleSignIn
import com.google.android.gms.common.api.ApiException
import com.majismart.zambia.auth.GoogleAuthManager
import com.majismart.zambia.ui.theme.*

@Composable
fun GoogleSignInHeader(
    modifier: Modifier = Modifier,
    onOpenNotifications: () -> Unit = {},
    unreadNotificationsCount: Int = 0
) {
    val context = LocalContext.current
    val user = GoogleAuthManager.currentUser

    // Activity Result Launcher for Google Sign-In Intent
    val launcher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.StartActivityForResult()
    ) { result ->
        if (result.resultCode == Activity.RESULT_OK) {
            val task = GoogleSignIn.getSignedInAccountFromIntent(result.data)
            try {
                val account = task.getResult(ApiException::class.java)
                if (account != null) {
                    GoogleAuthManager.handleSignInResult(account)
                }
            } catch (e: Exception) {
                // Fallback to demo profile if sign in cancelled or API key missing
                GoogleAuthManager.signInDemoUser()
            }
        } else {
            GoogleAuthManager.signInDemoUser()
        }
    }

    Card(
        modifier = modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(bottomStart = 24.dp, bottomEnd = 24.dp)),
        colors = CardDefaults.cardColors(containerColor = Color.Transparent),
        shape = RoundedCornerShape(0.dp)
    ) {
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .background(
                    brush = Brush.verticalGradient(
                        colors = listOf(MajiNavy, MajiOceanBlue, MajiBlue)
                    )
                )
                .padding(20.dp)
        ) {
            Column {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    // Title & Tagline
                    Column {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Icon(
                                Icons.Default.WaterDrop,
                                contentDescription = null,
                                tint = MajiLightBlue,
                                modifier = Modifier.size(24.dp)
                            )
                            Spacer(modifier = Modifier.width(6.dp))
                            Text(
                                text = "MajiSmart Zambia",
                                fontSize = 22.sp,
                                fontWeight = FontWeight.ExtraBold,
                                color = Color.White
                            )
                        }
                        Text(
                            text = "Smart Water Telemetry & Community Grid",
                            fontSize = 12.sp,
                            color = MajiSky,
                            fontWeight = FontWeight.Medium
                        )
                    }

                    // Notification Icon with Badge Counter
                    BadgedBox(
                        badge = {
                            if (unreadNotificationsCount > 0) {
                                Badge(
                                    containerColor = MajiRed,
                                    contentColor = Color.White
                                ) {
                                    Text(unreadNotificationsCount.toString())
                                }
                            }
                        }
                    ) {
                        Surface(
                            onClick = onOpenNotifications,
                            shape = CircleShape,
                            color = Color.White.copy(alpha = 0.15f),
                            modifier = Modifier.size(42.dp)
                        ) {
                            Box(contentAlignment = Alignment.Center) {
                                Icon(
                                    Icons.Default.Notifications,
                                    contentDescription = "Notifications",
                                    tint = Color.White,
                                    modifier = Modifier.size(22.dp)
                                )
                            }
                        }
                    }
                }

                Spacer(modifier = Modifier.height(18.dp))

                // Google User Account Profile Banner
                Surface(
                    color = Color.White.copy(alpha = 0.12f),
                    shape = RoundedCornerShape(16.dp),
                    border = CardDefaults.outlinedCardBorder().copy(
                        brush = Brush.horizontalGradient(
                            colors = listOf(Color.White.copy(alpha = 0.3f), Color.White.copy(alpha = 0.05f))
                        )
                    ),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(12.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        if (user != null) {
                            // User Profile Info
                            Row(
                                verticalAlignment = Alignment.CenterVertically,
                                modifier = Modifier.weight(1f)
                            ) {
                                Surface(
                                    shape = CircleShape,
                                    border = BorderStroke(2.dp, MajiLightBlue),
                                    modifier = Modifier.size(46.dp)
                                ) {
                                    if (!user.photoUrl.isNullOrBlank()) {
                                        AsyncImage(
                                            model = user.photoUrl,
                                            contentDescription = "Google Profile Picture",
                                            modifier = Modifier
                                                .fillMaxSize()
                                                .clip(CircleShape)
                                        )
                                    } else {
                                        Box(
                                            modifier = Modifier
                                                .fillMaxSize()
                                                .background(MajiCyan),
                                            contentAlignment = Alignment.Center
                                        ) {
                                            Text(
                                                text = user.name.take(1).uppercase(),
                                                color = Color.White,
                                                fontWeight = FontWeight.Bold,
                                                fontSize = 20.sp
                                            )
                                        }
                                    }
                                }

                                Spacer(modifier = Modifier.width(12.dp))

                                Column {
                                    Row(verticalAlignment = Alignment.CenterVertically) {
                                        Text(
                                            text = user.name,
                                            fontWeight = FontWeight.Bold,
                                            fontSize = 15.sp,
                                            color = Color.White
                                        )
                                        Spacer(modifier = Modifier.width(6.dp))
                                        Icon(
                                            Icons.Default.Verified,
                                            contentDescription = "Google Verified",
                                            tint = MajiEmerald,
                                            modifier = Modifier.size(16.dp)
                                        )
                                    }
                                    Text(
                                        text = user.email,
                                        fontSize = 12.sp,
                                        color = MajiSky
                                    )
                                }
                            }

                            // Google Sign Out Button
                            IconButton(
                                onClick = { GoogleAuthManager.signOut(context) },
                                modifier = Modifier
                                    .clip(CircleShape)
                                    .background(Color.White.copy(alpha = 0.2f))
                            ) {
                                Icon(
                                    Icons.Default.Logout,
                                    contentDescription = "Sign Out Google Account",
                                    tint = Color.White,
                                    modifier = Modifier.size(18.dp)
                                )
                            }
                        } else {
                            // Google Login Button
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Column(modifier = Modifier.weight(1f)) {
                                    Text(
                                        text = "Sign in with Google",
                                        fontWeight = FontWeight.Bold,
                                        fontSize = 14.sp,
                                        color = Color.White
                                    )
                                    Text(
                                        text = "Access location dispatch & field reports",
                                        fontSize = 11.sp,
                                        color = MajiSky
                                    )
                                }

                                Button(
                                    onClick = {
                                        val signInIntent = GoogleAuthManager.getGoogleSignInClient(context).signInIntent
                                        launcher.launch(signInIntent)
                                    },
                                    colors = ButtonDefaults.buttonColors(containerColor = Color.White),
                                    shape = RoundedCornerShape(12.dp)
                                ) {
                                    Row(verticalAlignment = Alignment.CenterVertically) {
                                        Icon(
                                            Icons.Default.AccountCircle,
                                            contentDescription = null,
                                            tint = MajiOceanBlue,
                                            modifier = Modifier.size(18.dp)
                                        )
                                        Spacer(modifier = Modifier.width(6.dp))
                                        Text(
                                            text = "Google Sign In",
                                            color = MajiNavy,
                                            fontWeight = FontWeight.Bold,
                                            fontSize = 12.sp
                                        )
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}
