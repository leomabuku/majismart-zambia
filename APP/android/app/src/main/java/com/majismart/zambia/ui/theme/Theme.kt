package com.majismart.zambia.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

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
        content = content
    )
}
