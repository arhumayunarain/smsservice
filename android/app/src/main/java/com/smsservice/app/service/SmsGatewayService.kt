package com.smsservice.app.service

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.net.NetworkRequest
import android.os.BatteryManager
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.telephony.SubscriptionManager
import android.telephony.TelephonyManager
import android.util.Log
import androidx.core.app.NotificationCompat
import com.smsservice.app.data.PrefsManager
import com.smsservice.app.sms.SmsSender
import com.smsservice.app.socket.SocketManager
import com.smsservice.app.ui.MainActivity
import dagger.hilt.android.AndroidEntryPoint
import java.util.concurrent.ConcurrentLinkedQueue
import javax.inject.Inject

@AndroidEntryPoint
class SmsGatewayService : Service() {

    companion object {
        private const val TAG = "SmsGatewayService"
        private const val NOTIFICATION_CHANNEL_ID = "sms_gateway"
        private const val NOTIFICATION_ID = 1
        private const val TELEMETRY_INTERVAL_MS = 60_000L

        const val ACTION_STATUS_BROADCAST = "com.smsservice.app.STATUS_UPDATE"
        const val EXTRA_CONNECTED = "connected"
        const val EXTRA_MESSAGES_TODAY = "messages_today"
        const val EXTRA_LAST_MESSAGE_TIME = "last_message_time"

        fun startService(context: Context) {
            val intent = Intent(context, SmsGatewayService::class.java)
            context.startForegroundService(intent)
        }

        fun stopService(context: Context) {
            val intent = Intent(context, SmsGatewayService::class.java)
            context.stopService(intent)
        }
    }

    @Inject lateinit var socketManager: SocketManager
    @Inject lateinit var prefsManager: PrefsManager
    @Inject lateinit var smsSender: SmsSender

    private val handler = Handler(Looper.getMainLooper())
    private var connectivityManager: ConnectivityManager? = null
    private var networkCallback: ConnectivityManager.NetworkCallback? = null
    private var notificationManager: NotificationManager? = null

    // SMS queue to prevent Android bulk SMS permission dialog
    private data class SmsTask(
        val messageId: String,
        val recipient: String,
        val body: String,
        val simSlot: Int?
    )
    private val smsQueue = ConcurrentLinkedQueue<SmsTask>()
    @Volatile private var processingQueue = false
    private val SMS_DELAY_MS = 500L // 0.5s between sends (bulk SMS dialog disabled via ADB)

    private val connectionStateListener: (Boolean) -> Unit = { connected ->
        updateNotification(connected)
        broadcastStatus(connected)
    }

    private val telemetryRunnable = object : Runnable {
        override fun run() {
            if (socketManager.isConnected()) {
                emitTelemetry()
            }
            handler.postDelayed(this, TELEMETRY_INTERVAL_MS)
        }
    }

    override fun onCreate() {
        super.onCreate()
        Log.i(TAG, "SmsGatewayService created")

        notificationManager = getSystemService(NOTIFICATION_SERVICE) as NotificationManager
        createNotificationChannel()
        startForeground(NOTIFICATION_ID, buildNotification("Connecting to server..."))

        socketManager.addConnectionStateListener(connectionStateListener)

        socketManager.setSmsListener { messageId, recipient, body, simSlot ->
            handleIncomingSms(messageId, recipient, body, simSlot)
        }
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        Log.i(TAG, "SmsGatewayService onStartCommand")

        if (!prefsManager.isPaired) {
            Log.w(TAG, "Device not paired — service running but not connecting")
            updateNotification(false)
            return START_STICKY
        }

        val serverUrl = prefsManager.serverUrl
        val deviceId = prefsManager.deviceId
        val registrationToken = prefsManager.registrationToken

        if (serverUrl.isNotBlank() && deviceId.isNotBlank() && registrationToken.isNotBlank()) {
            socketManager.connect(serverUrl, deviceId, registrationToken)
        } else {
            Log.w(TAG, "Missing pairing data — serverUrl=$serverUrl deviceId=$deviceId")
        }

        setupNetworkCallback()
        handler.postDelayed(telemetryRunnable, TELEMETRY_INTERVAL_MS)

        return START_STICKY
    }

    private fun handleIncomingSms(messageId: String, recipient: String, body: String, simSlot: Int?) {
        Log.i(TAG, "Queuing SMS: messageId=$messageId to=$recipient simSlot=$simSlot (queue size=${smsQueue.size})")
        smsQueue.add(SmsTask(messageId, recipient, body, simSlot))
        if (!processingQueue) {
            processingQueue = true
            processNextSms()
        }
    }

    private fun processNextSms() {
        val task = smsQueue.poll()
        if (task == null) {
            processingQueue = false
            Log.i(TAG, "SMS queue empty — done processing")
            return
        }

        Log.i(TAG, "Sending SMS from queue: messageId=${task.messageId} to=${task.recipient} (${smsQueue.size} remaining)")

        // Safety timeout: if no callback within 30s, report as sent and move on.
        // The SMS was dispatched to the modem (sendMultipartTextMessage didn't throw),
        // so treat it as SENT_TO_DEVICE rather than silently dropping the status.
        val safetyTimeout = Runnable {
            Log.w(TAG, "SMS callback timeout for messageId=${task.messageId} — reporting SENT_TO_DEVICE and moving to next")
            socketManager.emitSmsStatus(task.messageId, "SENT_TO_DEVICE", null)
            prefsManager.incrementMessagesSentToday()
            broadcastStatus(socketManager.isConnected())
            handler.postDelayed({ processNextSms() }, SMS_DELAY_MS)
        }
        handler.postDelayed(safetyTimeout, 30_000)

        handler.post {
            smsSender.sendSms(this, task.recipient, task.body, task.messageId, task.simSlot) { status, error ->
                Log.i(TAG, "SMS result: messageId=${task.messageId} status=$status error=$error")
                socketManager.emitSmsStatus(task.messageId, status, error)

                // Only schedule next on first callback (SENT_TO_DEVICE or FAILED), not on DELIVERED
                if (status == "SENT_TO_DEVICE" || status == "FAILED") {
                    handler.removeCallbacks(safetyTimeout)
                    prefsManager.incrementMessagesSentToday()
                    broadcastStatus(socketManager.isConnected())
                    // Wait before sending next SMS to avoid Android bulk SMS dialog
                    handler.postDelayed({ processNextSms() }, SMS_DELAY_MS)
                }
            }
        }
    }

    private fun setupNetworkCallback() {
        connectivityManager = getSystemService(CONNECTIVITY_SERVICE) as ConnectivityManager

        val networkRequest = NetworkRequest.Builder()
            .addCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
            .build()

        networkCallback = object : ConnectivityManager.NetworkCallback() {
            override fun onAvailable(network: Network) {
                Log.i(TAG, "Network available — checking socket connection")
                if (!socketManager.isConnected() && prefsManager.isPaired) {
                    val serverUrl = prefsManager.serverUrl
                    val deviceId = prefsManager.deviceId
                    val registrationToken = prefsManager.registrationToken
                    if (serverUrl.isNotBlank() && deviceId.isNotBlank()) {
                        handler.post {
                            socketManager.connect(serverUrl, deviceId, registrationToken)
                        }
                    }
                }
            }

            override fun onLost(network: Network) {
                Log.w(TAG, "Network lost — socket will detect via ping timeout")
            }
        }

        connectivityManager?.registerNetworkCallback(networkRequest, networkCallback!!)
    }

    @Suppress("DEPRECATION")
    private fun emitTelemetry() {
        try {
            val batteryManager = getSystemService(BATTERY_SERVICE) as? BatteryManager
            val batteryLevel = batteryManager?.getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY) ?: -1

            val telephonyManager = getSystemService(TELEPHONY_SERVICE) as? TelephonyManager
            val simCarrier = telephonyManager?.networkOperatorName ?: "Unknown"
            val phoneNumber = try {
                telephonyManager?.line1Number
            } catch (e: SecurityException) {
                null
            }
            val signalStrength = telephonyManager?.signalStrength?.level ?: -1

            val networkType = getNetworkType()
            val androidVersion = Build.VERSION.RELEASE
            val appVersion = try {
                packageManager.getPackageInfo(packageName, 0).versionName
            } catch (e: Exception) {
                "1.0.0"
            }

            // Collect per-SIM information
            val sims = getActiveSimInfo()

            val telemetry = mapOf<String, Any?>(
                "battery" to batteryLevel,
                "simCarrier" to simCarrier,
                "phoneNumber" to phoneNumber,
                "signalStrength" to signalStrength,
                "androidVersion" to androidVersion,
                "appVersion" to appVersion,
                "networkType" to networkType,
                "deviceId" to prefsManager.deviceId,
                "sims" to sims
            )

            socketManager.emitTelemetry(telemetry)
            Log.d(TAG, "Telemetry emitted: battery=$batteryLevel carrier=$simCarrier network=$networkType sims=${sims.size}")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to collect/emit telemetry", e)
        }
    }

    @Suppress("DEPRECATION")
    private fun getActiveSimInfo(): List<Map<String, Any?>> {
        val sims = mutableListOf<Map<String, Any?>>()
        try {
            val subscriptionManager = getSystemService(Context.TELEPHONY_SUBSCRIPTION_SERVICE) as? SubscriptionManager
            val activeSubscriptions = subscriptionManager?.activeSubscriptionInfoList ?: return sims
            for (subInfo in activeSubscriptions) {
                sims.add(mapOf(
                    "slot" to subInfo.simSlotIndex,
                    "carrier" to (subInfo.carrierName?.toString() ?: "Unknown"),
                    "phoneNumber" to (subInfo.number ?: null)
                ))
            }
        } catch (e: SecurityException) {
            Log.w(TAG, "Cannot read SIM info — READ_PHONE_STATE permission missing", e)
        }
        return sims
    }

    private fun getNetworkType(): String {
        val cm = connectivityManager ?: getSystemService(CONNECTIVITY_SERVICE) as? ConnectivityManager
        val network = cm?.activeNetwork ?: return "Unknown"
        val caps = cm.getNetworkCapabilities(network) ?: return "Unknown"
        return when {
            caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) -> "WiFi"
            caps.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR) -> {
                val tm = getSystemService(TELEPHONY_SERVICE) as? TelephonyManager
                when (tm?.dataNetworkType) {
                    TelephonyManager.NETWORK_TYPE_NR -> "5G"
                    TelephonyManager.NETWORK_TYPE_LTE -> "LTE"
                    TelephonyManager.NETWORK_TYPE_HSPAP,
                    TelephonyManager.NETWORK_TYPE_HSPA -> "3G"
                    else -> "Mobile"
                }
            }
            caps.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET) -> "Ethernet"
            else -> "Unknown"
        }
    }

    private fun createNotificationChannel() {
        val channel = NotificationChannel(
            NOTIFICATION_CHANNEL_ID,
            "SMS Gateway Service",
            NotificationManager.IMPORTANCE_LOW
        ).apply {
            description = "Persistent connection status for SMS Gateway"
            setShowBadge(false)
        }
        notificationManager?.createNotificationChannel(channel)
    }

    private fun buildNotification(text: String) =
        NotificationCompat.Builder(this, NOTIFICATION_CHANNEL_ID)
            .setContentTitle("SMS Gateway")
            .setContentText(text)
            .setSmallIcon(android.R.drawable.ic_menu_send)
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setContentIntent(
                PendingIntent.getActivity(
                    this, 0,
                    Intent(this, MainActivity::class.java),
                    PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
                )
            )
            .build()

    private fun updateNotification(connected: Boolean) {
        val text = if (connected) "Connected to server" else "Disconnected — reconnecting..."
        notificationManager?.notify(NOTIFICATION_ID, buildNotification(text))
    }

    private fun broadcastStatus(connected: Boolean) {
        val intent = Intent(ACTION_STATUS_BROADCAST).apply {
            putExtra(EXTRA_CONNECTED, connected)
            putExtra(EXTRA_MESSAGES_TODAY, prefsManager.getMessagesSentToday())
            putExtra(EXTRA_LAST_MESSAGE_TIME, prefsManager.lastMessageTime)
        }
        sendBroadcast(intent)
    }

    override fun onDestroy() {
        Log.i(TAG, "SmsGatewayService destroyed")
        handler.removeCallbacks(telemetryRunnable)
        networkCallback?.let { connectivityManager?.unregisterNetworkCallback(it) }
        socketManager.removeConnectionStateListener(connectionStateListener)
        socketManager.disconnect()
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null
}
