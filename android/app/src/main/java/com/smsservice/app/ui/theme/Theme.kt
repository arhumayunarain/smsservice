package com.smsservice.app.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

// Dark color scheme matching the Grafana-style dashboard
private val DarkColorScheme = darkColorScheme(
    primary = Color(0xFF4F9CF9),           // Blue accent
    onPrimary = Color(0xFF001D36),
    primaryContainer = Color(0xFF00344F),
    onPrimaryContainer = Color(0xFFCDE5FF),
    secondary = Color(0xFF4CAF7D),         // Green for connected
    onSecondary = Color(0xFF003823),
    secondaryContainer = Color(0xFF005235),
    onSecondaryContainer = Color(0xFF6DDBAA),
    tertiary = Color(0xFFFF6B6B),          // Red for disconnected/errors
    onTertiary = Color(0xFF690000),
    tertiaryContainer = Color(0xFF920000),
    onTertiaryContainer = Color(0xFFFFDAD6),
    error = Color(0xFFFFB4AB),
    onError = Color(0xFF690005),
    errorContainer = Color(0xFF93000A),
    onErrorContainer = Color(0xFFFFDAD6),
    background = Color(0xFF0F1117),        // Very dark background
    onBackground = Color(0xFFE2E4E9),
    surface = Color(0xFF1A1D27),           // Slightly lighter surface
    onSurface = Color(0xFFE2E4E9),
    surfaceVariant = Color(0xFF1E2130),    // Card/panel background
    onSurfaceVariant = Color(0xFFC2C7D0),
    outline = Color(0xFF2D3147),
    outlineVariant = Color(0xFF2D3147),
)

@Composable
fun SMSServiceTheme(
    content: @Composable () -> Unit
) {
    MaterialTheme(
        colorScheme = DarkColorScheme,
        content = content
    )
}
