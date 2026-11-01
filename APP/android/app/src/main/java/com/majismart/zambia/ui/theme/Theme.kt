package com.majismart.zambia.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.material3.Typography
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.unit.sp

private val LightColorScheme = lightColorScheme(
    primary = MajiOceanBlue,
    secondary = MajiCyan,
    tertiary = MajiEmerald,
    background = MajiBackground,
    surface = MajiSurface,
    onPrimary = Color.White,
    onSecondary = Color.White,
    onBackground = MajiTextPrimary,
    onSurface = MajiTextPrimary
)

@Composable
fun MajiSmartTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = LightColorScheme,
        typography = Typography(
            bodyLarge = TextStyle(fontSize = 18.sp, lineHeight = 27.sp),
            bodyMedium = TextStyle(fontSize = 16.sp, lineHeight = 24.sp),
            bodySmall = TextStyle(fontSize = 14.sp, lineHeight = 21.sp),
            labelLarge = TextStyle(fontSize = 16.sp, lineHeight = 22.sp),
            labelMedium = TextStyle(fontSize = 14.sp, lineHeight = 20.sp),
            labelSmall = TextStyle(fontSize = 14.sp, lineHeight = 20.sp)
        ),
        content = content
    )
}

