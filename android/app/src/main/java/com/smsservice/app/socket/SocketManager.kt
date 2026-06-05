package com.smsservice.app.socket

import android.util.Log
import com.smsservice.app.data.PrefsManager
import io.socket.client.IO
import io.socket.client.Socket
import org.json.JSONObject
import java.net.URI
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class SocketManager @Inject constructor(
    private val prefsManager: PrefsManager
) {

    companion object {
        private const val TAG = "SocketManager"
        const val EVENT_SMS_SEND = "sms:send"
        const val EVENT_SMS_STATUS = "sms:status"
        const val EVENT_DEVICE_TELEMETRY = "device:telemetry"
    }

    private var socket: Socket? = null
    private var smsListener: ((messageId: String, recipient: String, body: String, simSlot: Int?) -> Unit)? = null

    fun setSmsListener(listener: (messageId: String, recipient: String, body: String, simSlot: Int?) -> Unit) {
        smsListener = listener
    }

    fun connect(serverUrl: String, deviceId: String, registrationToken: String) {
        try {
            disconnect()

            val options = IO.Options().apply {
                reconnection = true
                reconnectionAttempts = Int.MAX_VALUE
                reconnectionDelay = 2000
                reconnectionDelayMax = 10000
                transports = arrayOf("websocket", "polling")
            }

            val uri = URI.create(serverUrl)
            socket = IO.socket(uri, options).apply {
                on(Socket.EVENT_CONNECT) {
                    Log.i(TAG, "Connected to server, sending auth (deviceId=$deviceId)")
                    // Send auth via event — handshake auth doesn't work with Java client
                    val authData = JSONObject().apply {
                        put("deviceId", deviceId)
                        put("registrationToken", registrationToken)
                    }
                    emit("device:auth", authData)
                }

                on("device:auth_result") { args ->
                    try {
                        val result = args.firstOrNull() as? JSONObject ?: return@on
                        val success = result.optBoolean("success", false)
                        if (success) {
                            Log.i(TAG, "Auth successful")
                            onConnected()
                        } else {
                            val error = result.optString("error", "Unknown")
                            Log.e(TAG, "Auth failed: $error")
                            onDisconnected()
                        }
                    } catch (e: Exception) {
                        Log.e(TAG, "Error parsing auth result", e)
                    }
                }

                on(Socket.EVENT_DISCONNECT) { args ->
                    val reason = args.firstOrNull()?.toString() ?: "unknown"
                    Log.w(TAG, "Disconnected from server: $reason")
                    onDisconnected()
                }

                on(Socket.EVENT_CONNECT_ERROR) { args ->
                    val error = args.firstOrNull()?.toString() ?: "unknown error"
                    Log.e(TAG, "Connection error: $error")
                }

                on(EVENT_SMS_SEND) { args ->
                    try {
                        val data = args.firstOrNull() as? JSONObject ?: return@on
                        val messageId = data.getString("messageId")
                        val recipient = data.getString("recipient")
                        val body = data.getString("body")
                        val simSlot = if (data.has("simSlot") && !data.isNull("simSlot")) data.getInt("simSlot") else null
                        Log.i(TAG, "Received sms:send for messageId=$messageId to $recipient simSlot=$simSlot")
                        smsListener?.invoke(messageId, recipient, body, simSlot)
                    } catch (e: Exception) {
                        Log.e(TAG, "Error parsing sms:send event", e)
                    }
                }

                connect()
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to create socket connection", e)
        }
    }

    private fun onConnected() {
        _connectionStateListeners.forEach { it(true) }
    }

    private fun onDisconnected() {
        _connectionStateListeners.forEach { it(false) }
    }

    private val _connectionStateListeners = mutableListOf<(Boolean) -> Unit>()

    fun addConnectionStateListener(listener: (Boolean) -> Unit) {
        _connectionStateListeners.add(listener)
    }

    fun removeConnectionStateListener(listener: (Boolean) -> Unit) {
        _connectionStateListeners.remove(listener)
    }

    fun disconnect() {
        socket?.apply {
            off()
            disconnect()
            close()
        }
        socket = null
    }

    fun reconnect() {
        val serverUrl = prefsManager.serverUrl
        val deviceId = prefsManager.deviceId
        val registrationToken = prefsManager.registrationToken
        if (serverUrl.isNotBlank() && deviceId.isNotBlank() && registrationToken.isNotBlank()) {
            Log.i(TAG, "Manual reconnect requested")
            connect(serverUrl, deviceId, registrationToken)
        } else {
            Log.w(TAG, "Cannot reconnect — missing pairing data")
        }
    }

    fun isConnected(): Boolean = socket?.connected() ?: false

    fun emitTelemetry(data: Map<String, Any?>) {
        if (!isConnected()) return
        try {
            val json = JSONObject()
            data.forEach { (key, value) ->
                if (value != null) json.put(key, value) else json.put(key, JSONObject.NULL)
            }
            socket?.emit(EVENT_DEVICE_TELEMETRY, json)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to emit telemetry", e)
        }
    }

    fun emitSmsStatus(messageId: String, status: String, error: String?) {
        if (!isConnected()) {
            Log.w(TAG, "Cannot emit sms:status — socket not connected (messageId=$messageId)")
            return
        }
        try {
            val json = JSONObject().apply {
                put("messageId", messageId)
                put("status", status)
                if (error != null) put("error", error) else put("error", JSONObject.NULL)
            }
            socket?.emit(EVENT_SMS_STATUS, json)
            Log.i(TAG, "Emitted sms:status: messageId=$messageId status=$status")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to emit sms:status", e)
        }
    }
}
