package com.smsservice.app.data

import android.content.Context
import android.content.SharedPreferences
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class PrefsManager @Inject constructor(context: Context) {

    private val prefs: SharedPreferences =
        context.getSharedPreferences("sms_gateway_prefs", Context.MODE_PRIVATE)

    companion object {
        private const val KEY_SERVER_URL = "server_url"
        private const val KEY_REGISTRATION_TOKEN = "registration_token"
        private const val KEY_DEVICE_ID = "device_id"
        private const val KEY_IS_PAIRED = "is_paired"
        private const val KEY_MESSAGES_SENT_TODAY = "messages_sent_today"
        private const val KEY_LAST_MESSAGE_TIME = "last_message_time"
        private const val KEY_MESSAGES_SENT_DATE = "messages_sent_date"
    }

    var serverUrl: String
        get() = prefs.getString(KEY_SERVER_URL, "") ?: ""
        set(value) = prefs.edit().putString(KEY_SERVER_URL, value).apply()

    var registrationToken: String
        get() = prefs.getString(KEY_REGISTRATION_TOKEN, "") ?: ""
        set(value) = prefs.edit().putString(KEY_REGISTRATION_TOKEN, value).apply()

    var deviceId: String
        get() = prefs.getString(KEY_DEVICE_ID, "") ?: ""
        set(value) = prefs.edit().putString(KEY_DEVICE_ID, value).apply()

    var isPaired: Boolean
        get() = prefs.getBoolean(KEY_IS_PAIRED, false)
        set(value) = prefs.edit().putBoolean(KEY_IS_PAIRED, value).apply()

    var lastMessageTime: Long
        get() = prefs.getLong(KEY_LAST_MESSAGE_TIME, 0L)
        set(value) = prefs.edit().putLong(KEY_LAST_MESSAGE_TIME, value).apply()

    fun getMessagesSentToday(): Int {
        val today = java.text.SimpleDateFormat("yyyy-MM-dd", java.util.Locale.getDefault())
            .format(java.util.Date())
        val savedDate = prefs.getString(KEY_MESSAGES_SENT_DATE, "")
        return if (savedDate == today) {
            prefs.getInt(KEY_MESSAGES_SENT_TODAY, 0)
        } else {
            // Reset counter for new day
            prefs.edit()
                .putInt(KEY_MESSAGES_SENT_TODAY, 0)
                .putString(KEY_MESSAGES_SENT_DATE, today)
                .apply()
            0
        }
    }

    fun incrementMessagesSentToday() {
        val today = java.text.SimpleDateFormat("yyyy-MM-dd", java.util.Locale.getDefault())
            .format(java.util.Date())
        val savedDate = prefs.getString(KEY_MESSAGES_SENT_DATE, "")
        val currentCount = if (savedDate == today) prefs.getInt(KEY_MESSAGES_SENT_TODAY, 0) else 0
        prefs.edit()
            .putInt(KEY_MESSAGES_SENT_TODAY, currentCount + 1)
            .putString(KEY_MESSAGES_SENT_DATE, today)
            .apply()
        lastMessageTime = System.currentTimeMillis()
    }

    fun clearPairing() {
        prefs.edit()
            .remove(KEY_SERVER_URL)
            .remove(KEY_REGISTRATION_TOKEN)
            .remove(KEY_DEVICE_ID)
            .putBoolean(KEY_IS_PAIRED, false)
            .apply()
    }
}
