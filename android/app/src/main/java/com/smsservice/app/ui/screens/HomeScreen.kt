package com.smsservice.app.ui.screens

import android.app.Activity
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.Build
import android.telephony.SmsManager
import android.telephony.TelephonyManager
import android.util.Log
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.smsservice.app.data.PrefsManager
import com.smsservice.app.service.SmsGatewayService
import com.smsservice.app.socket.SocketManager
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

@Composable
fun HomeScreen(
    prefsManager: PrefsManager,
    socketManager: SocketManager,
    onUnpair: () -> Unit
) {
    val context = LocalContext.current

    var isConnected by remember { mutableStateOf(socketManager.isConnected()) }
    var messagesToday by remember { mutableIntStateOf(prefsManager.getMessagesSentToday()) }
    var lastMessageTime by remember { mutableLongStateOf(prefsManager.lastMessageTime) }

    // Listen for status broadcasts from the service
    DisposableEffect(context) {
        val receiver = object : BroadcastReceiver() {
            override fun onReceive(ctx: Context, intent: Intent) {
                isConnected = intent.getBooleanExtra(SmsGatewayService.EXTRA_CONNECTED, false)
                messagesToday = intent.getIntExtra(SmsGatewayService.EXTRA_MESSAGES_TODAY, 0)
                lastMessageTime = intent.getLongExtra(SmsGatewayService.EXTRA_LAST_MESSAGE_TIME, 0L)
            }
        }
        val filter = IntentFilter(SmsGatewayService.ACTION_STATUS_BROADCAST)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            context.registerReceiver(receiver, filter, Context.RECEIVER_NOT_EXPORTED)
        } else {
            context.registerReceiver(receiver, filter)
        }
        onDispose {
            context.unregisterReceiver(receiver)
        }
    }

    // Poll connection state every 2 seconds (handles initial state before broadcast)
    LaunchedEffect(Unit) {
        while (true) {
            isConnected = socketManager.isConnected()
            messagesToday = prefsManager.getMessagesSentToday()
            lastMessageTime = prefsManager.lastMessageTime
            kotlinx.coroutines.delay(2000)
        }
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(16.dp)
            .verticalScroll(rememberScrollState()),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        // Header
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text(
                text = "SMS Gateway",
                style = MaterialTheme.typography.headlineMedium,
                fontWeight = FontWeight.Bold,
                color = MaterialTheme.colorScheme.onBackground
            )
            Text(
                text = Build.VERSION.RELEASE,
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }

        // Connection status card
        Card(
            modifier = Modifier.fillMaxWidth(),
            colors = CardDefaults.cardColors(
                containerColor = MaterialTheme.colorScheme.surfaceVariant
            ),
            shape = RoundedCornerShape(12.dp)
        ) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(16.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    // Status dot
                    Box(
                        modifier = Modifier
                            .size(14.dp)
                            .clip(CircleShape)
                            .background(
                                if (isConnected) Color(0xFF4CAF7D) else Color(0xFFFF6B6B)
                            )
                    )
                    Column {
                        Text(
                            text = if (isConnected) "Connected" else "Disconnected",
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.SemiBold,
                            color = if (isConnected) Color(0xFF4CAF7D) else Color(0xFFFF6B6B)
                        )
                        Text(
                            text = prefsManager.serverUrl.take(40),
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            fontFamily = FontFamily.Monospace
                        )
                    }
                }
            }
        }

        // Reconnect button — shown when disconnected
        if (!isConnected) {
            Button(
                onClick = {
                    socketManager.reconnect()
                },
                modifier = Modifier.fillMaxWidth(),
                colors = ButtonDefaults.buttonColors(
                    containerColor = MaterialTheme.colorScheme.primary
                ),
                shape = RoundedCornerShape(12.dp)
            ) {
                Text("Reconnect", fontWeight = FontWeight.SemiBold)
            }
        }

        // Device info card
        Card(
            modifier = Modifier.fillMaxWidth(),
            colors = CardDefaults.cardColors(
                containerColor = MaterialTheme.colorScheme.surfaceVariant
            ),
            shape = RoundedCornerShape(12.dp)
        ) {
            Column(
                modifier = Modifier.padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                Text(
                    text = "Device Info",
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    fontWeight = FontWeight.Medium
                )
                InfoRow("Device ID", prefsManager.deviceId.take(20) + "...")
                InfoRow("Android", Build.VERSION.RELEASE)
                InfoRow("Model", "${Build.MANUFACTURER} ${Build.MODEL}")
            }
        }

        // Stats card
        Card(
            modifier = Modifier.fillMaxWidth(),
            colors = CardDefaults.cardColors(
                containerColor = MaterialTheme.colorScheme.surfaceVariant
            ),
            shape = RoundedCornerShape(12.dp)
        ) {
            Column(
                modifier = Modifier.padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                Text(
                    text = "Statistics",
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    fontWeight = FontWeight.Medium
                )
                InfoRow("Messages Today", messagesToday.toString())
                InfoRow(
                    "Last Message",
                    if (lastMessageTime > 0) {
                        SimpleDateFormat("HH:mm:ss", Locale.getDefault()).format(Date(lastMessageTime))
                    } else {
                        "None"
                    }
                )
            }
        }

        // SMS Diagnostics card
        SmsDiagnosticsCard()

        Spacer(modifier = Modifier.height(16.dp))

        // Action buttons
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            OutlinedButton(
                onClick = {
                    SmsGatewayService.stopService(context)
                },
                modifier = Modifier.weight(1f),
                colors = ButtonDefaults.outlinedButtonColors(
                    contentColor = MaterialTheme.colorScheme.error
                )
            ) {
                Text("Disconnect")
            }

            Button(
                onClick = {
                    SmsGatewayService.stopService(context)
                    prefsManager.clearPairing()
                    onUnpair()
                },
                modifier = Modifier.weight(1f),
                colors = ButtonDefaults.buttonColors(
                    containerColor = MaterialTheme.colorScheme.tertiary
                )
            ) {
                Text("Unpair")
            }
        }
    }
}

@Composable
private fun SmsDiagnosticsCard() {
    val context = LocalContext.current
    var testNumber by remember { mutableStateOf("") }
    var testResult by remember { mutableStateOf("") }
    var isSending by remember { mutableStateOf(false) }

    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surfaceVariant
        ),
        shape = RoundedCornerShape(12.dp)
    ) {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            Text(
                text = "SMS Diagnostics",
                style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                fontWeight = FontWeight.Medium
            )

            // Show SIM/network info
            val telephonyManager = remember {
                context.getSystemService(Context.TELEPHONY_SERVICE) as? TelephonyManager
            }
            val carrier = telephonyManager?.networkOperatorName ?: "Unknown"
            val networkType = when (telephonyManager?.dataNetworkType) {
                TelephonyManager.NETWORK_TYPE_LTE -> "LTE"
                TelephonyManager.NETWORK_TYPE_NR -> "5G"
                TelephonyManager.NETWORK_TYPE_HSPAP -> "3G+"
                else -> "Unknown"
            }
            InfoRow("Carrier", carrier)
            InfoRow("Network", networkType)
            InfoRow("SIM State", when (telephonyManager?.simState) {
                TelephonyManager.SIM_STATE_READY -> "Ready"
                TelephonyManager.SIM_STATE_ABSENT -> "Absent"
                TelephonyManager.SIM_STATE_PIN_REQUIRED -> "PIN Required"
                TelephonyManager.SIM_STATE_PUK_REQUIRED -> "PUK Required"
                else -> "Unknown (${telephonyManager?.simState})"
            })

            HorizontalDivider(modifier = Modifier.padding(vertical = 4.dp))

            // Test SMS
            OutlinedTextField(
                value = testNumber,
                onValueChange = { testNumber = it },
                label = { Text("Phone number") },
                placeholder = { Text("03001234567") },
                modifier = Modifier.fillMaxWidth(),
                singleLine = true,
                textStyle = LocalTextStyle.current.copy(fontFamily = FontFamily.Monospace)
            )

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                Button(
                    onClick = {
                        if (testNumber.isBlank()) {
                            testResult = "Enter a phone number"
                            return@Button
                        }
                        isSending = true
                        testResult = "Sending (no SMSC)..."
                        sendTestSms(context, testNumber.trim(), null) { result ->
                            testResult = result
                            isSending = false
                        }
                    },
                    modifier = Modifier.weight(1f),
                    enabled = !isSending,
                    shape = RoundedCornerShape(8.dp)
                ) {
                    Text(if (isSending) "..." else "Test (auto)", fontSize = 12.sp)
                }

                Button(
                    onClick = {
                        if (testNumber.isBlank()) {
                            testResult = "Enter a phone number"
                            return@Button
                        }
                        isSending = true
                        testResult = "Sending (SMSC +923090000)..."
                        sendTestSms(context, testNumber.trim(), "+923090000") { result ->
                            testResult = result
                            isSending = false
                        }
                    },
                    modifier = Modifier.weight(1f),
                    enabled = !isSending,
                    colors = ButtonDefaults.buttonColors(
                        containerColor = Color(0xFF4CAF7D)
                    ),
                    shape = RoundedCornerShape(8.dp)
                ) {
                    Text(if (isSending) "..." else "Test (Zong)", fontSize = 12.sp)
                }
            }

            if (testResult.isNotEmpty()) {
                Text(
                    text = testResult,
                    style = MaterialTheme.typography.bodySmall,
                    color = if (testResult.startsWith("OK") || testResult.startsWith("SENT"))
                        Color(0xFF4CAF7D) else Color(0xFFFF6B6B),
                    fontFamily = FontFamily.Monospace,
                    modifier = Modifier.padding(top = 4.dp)
                )
            }
        }
    }
}

private fun sendTestSms(context: Context, phoneNumber: String, smscAddress: String?, onResult: (String) -> Unit) {
    try {
        val smsManager = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            context.getSystemService(SmsManager::class.java)
        } else {
            @Suppress("DEPRECATION")
            SmsManager.getDefault()
        }

        val testId = "test_${System.currentTimeMillis()}"
        val sentAction = "SMS_TEST_SENT_$testId"

        val sentPI = PendingIntent.getBroadcast(
            context,
            testId.hashCode(),
            Intent(sentAction),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_ONE_SHOT
        )

        val sentReceiver = object : BroadcastReceiver() {
            override fun onReceive(ctx: Context, intent: Intent) {
                ctx.unregisterReceiver(this)
                val errorCode = intent.getIntExtra("errorCode", -1)
                val result = when (resultCode) {
                    Activity.RESULT_OK ->
                        "SENT OK"
                    SmsManager.RESULT_ERROR_GENERIC_FAILURE ->
                        "FAILED: Generic failure (errorCode=$errorCode)\nThis usually means wrong/missing SMSC"
                    SmsManager.RESULT_ERROR_RADIO_OFF ->
                        "FAILED: Radio is OFF"
                    SmsManager.RESULT_ERROR_NULL_PDU ->
                        "FAILED: Null PDU"
                    SmsManager.RESULT_ERROR_NO_SERVICE ->
                        "FAILED: No SMS service"
                    SmsManager.RESULT_ERROR_LIMIT_EXCEEDED ->
                        "FAILED: SMS limit exceeded"
                    SmsManager.RESULT_ERROR_SHORT_CODE_NOT_ALLOWED ->
                        "FAILED: Short code not allowed"
                    SmsManager.RESULT_ERROR_SHORT_CODE_NEVER_ALLOWED ->
                        "FAILED: Short code never allowed"
                    SmsManager.RESULT_RIL_RADIO_NOT_AVAILABLE ->
                        "FAILED: RIL radio not available"
                    SmsManager.RESULT_RIL_SMS_SEND_FAIL_RETRY ->
                        "FAILED: RIL send fail (retry)"
                    SmsManager.RESULT_RIL_NETWORK_REJECT ->
                        "FAILED: Network rejected"
                    SmsManager.RESULT_RIL_INVALID_SMSC_ADDRESS ->
                        "FAILED: INVALID SMSC ADDRESS!\nSMSC is missing or wrong"
                    SmsManager.RESULT_RIL_MODEM_ERR ->
                        "FAILED: Modem error"
                    SmsManager.RESULT_RIL_NETWORK_ERR ->
                        "FAILED: Network error"
                    SmsManager.RESULT_RIL_INTERNAL_ERR ->
                        "FAILED: RIL internal error"
                    SmsManager.RESULT_RIL_NO_RESOURCES ->
                        "FAILED: No resources"
                    else ->
                        "FAILED: Unknown (resultCode=$resultCode, errorCode=$errorCode)"
                }
                Log.i("SmsDiag", "Test SMS result: $result (resultCode=$resultCode errorCode=$errorCode)")
                android.os.Handler(android.os.Looper.getMainLooper()).post {
                    onResult(result)
                }
            }
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            context.registerReceiver(sentReceiver, IntentFilter(sentAction), Context.RECEIVER_EXPORTED)
        } else {
            context.registerReceiver(sentReceiver, IntentFilter(sentAction))
        }

        smsManager.sendTextMessage(phoneNumber, smscAddress, "Test from SMS Gateway", sentPI, null)
        Log.i("SmsDiag", "Test SMS dispatched to $phoneNumber smsc=$smscAddress")
    } catch (e: SecurityException) {
        Log.e("SmsDiag", "Permission denied", e)
        onResult("FAILED: Permission denied\n${e.message}")
    } catch (e: Exception) {
        Log.e("SmsDiag", "Exception sending test SMS", e)
        onResult("FAILED: ${e.javaClass.simpleName}\n${e.message}")
    }
}

@Composable
private fun InfoRow(label: String, value: String) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween
    ) {
        Text(
            text = label,
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
        Text(
            text = value,
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurface,
            fontFamily = FontFamily.Monospace
        )
    }
}
