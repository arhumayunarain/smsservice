package com.smsservice.app.ui

import android.Manifest
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.PowerManager
import android.provider.Settings
import android.util.Log
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import com.smsservice.app.data.PrefsManager
import com.smsservice.app.service.SmsGatewayService
import com.smsservice.app.socket.SocketManager
import com.smsservice.app.ui.screens.HomeScreen
import com.smsservice.app.ui.screens.PairingScreen
import com.smsservice.app.ui.theme.SMSServiceTheme
import dagger.hilt.android.AndroidEntryPoint
import javax.inject.Inject

private const val TAG = "MainActivity"

@AndroidEntryPoint
class MainActivity : ComponentActivity() {

    @Inject lateinit var prefsManager: PrefsManager
    @Inject lateinit var socketManager: SocketManager

    private val permissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions()
    ) { results ->
        results.forEach { (permission, granted) ->
            Log.d(TAG, "Permission $permission: $granted")
        }
        requestBatteryOptimizationExemption()
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        requestRequiredPermissions()

        setContent {
            SMSServiceTheme {
                Surface(
                    modifier = Modifier.fillMaxSize(),
                    color = MaterialTheme.colorScheme.background
                ) {
                    AppNavigation(
                        prefsManager = prefsManager,
                        socketManager = socketManager
                    )
                }
            }
        }
    }

    private fun requestRequiredPermissions() {
        val permissions = mutableListOf<String>()

        // SMS permission
        permissions.add(Manifest.permission.SEND_SMS)

        // Phone state (for SIM info)
        permissions.add(Manifest.permission.READ_PHONE_STATE)

        // Notifications (Android 13+)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            permissions.add(Manifest.permission.POST_NOTIFICATIONS)
        }

        permissionLauncher.launch(permissions.toTypedArray())
    }

    private fun requestBatteryOptimizationExemption() {
        try {
            val pm = getSystemService(POWER_SERVICE) as PowerManager
            if (!pm.isIgnoringBatteryOptimizations(packageName)) {
                val intent = Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS).apply {
                    data = Uri.parse("package:$packageName")
                }
                startActivity(intent)
            }
        } catch (e: Exception) {
            Log.w(TAG, "Could not request battery optimization exemption", e)
        }
    }
}

@Composable
private fun AppNavigation(
    prefsManager: PrefsManager,
    socketManager: SocketManager
) {
    val navController = rememberNavController()
    var isPaired by remember { mutableStateOf(prefsManager.isPaired) }

    val startDestination = if (isPaired) "home" else "pairing"

    NavHost(navController = navController, startDestination = startDestination) {
        composable("pairing") {
            PairingScreen(
                prefsManager = prefsManager,
                onPaired = {
                    isPaired = true
                    navController.navigate("home") {
                        popUpTo("pairing") { inclusive = true }
                    }
                }
            )
        }

        composable("home") {
            HomeScreen(
                prefsManager = prefsManager,
                socketManager = socketManager,
                onUnpair = {
                    isPaired = false
                    navController.navigate("pairing") {
                        popUpTo("home") { inclusive = true }
                    }
                }
            )
        }
    }
}
