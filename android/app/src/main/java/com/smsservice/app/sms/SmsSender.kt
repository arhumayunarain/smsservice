package com.smsservice.app.sms

import android.app.Activity
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.Build
import android.telephony.SmsManager
import android.telephony.SubscriptionManager
import android.util.Log
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class SmsSender @Inject constructor() {

    companion object {
        private const val TAG = "SmsSender"
    }

    fun sendSms(
        context: Context,
        phoneNumber: String,
        message: String,
        messageId: String,
        simSlot: Int? = null,
        onResult: (status: String, error: String?) -> Unit
    ) {
        try {
            val smsManager: SmsManager = if (simSlot != null) {
                getSmsManagerForSlot(context, simSlot)
            } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                context.getSystemService(SmsManager::class.java)
            } else {
                @Suppress("DEPRECATION")
                SmsManager.getDefault()
            }

            val sentAction = "SMS_SENT_$messageId"
            val deliveredAction = "SMS_DELIVERED_$messageId"

            val pendingIntentFlags = PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_ONE_SHOT

            val sentPI = PendingIntent.getBroadcast(
                context,
                messageId.hashCode(),
                Intent(sentAction),
                pendingIntentFlags
            )

            val deliveredPI = PendingIntent.getBroadcast(
                context,
                messageId.hashCode() + 1,
                Intent(deliveredAction),
                pendingIntentFlags
            )

            // Register sent receiver
            val sentReceiver = object : BroadcastReceiver() {
                override fun onReceive(ctx: Context, intent: Intent) {
                    ctx.unregisterReceiver(this)
                    when (resultCode) {
                        Activity.RESULT_OK -> {
                            Log.i(TAG, "SMS sent to device for messageId=$messageId")
                            onResult("SENT_TO_DEVICE", null)
                        }
                        SmsManager.RESULT_ERROR_GENERIC_FAILURE -> {
                            Log.e(TAG, "SMS generic failure for messageId=$messageId")
                            onResult("FAILED", "Generic SMS failure")
                        }
                        SmsManager.RESULT_ERROR_RADIO_OFF -> {
                            Log.e(TAG, "SMS radio off for messageId=$messageId")
                            onResult("FAILED", "Radio is off")
                        }
                        SmsManager.RESULT_ERROR_NULL_PDU -> {
                            Log.e(TAG, "SMS null PDU for messageId=$messageId")
                            onResult("FAILED", "Null PDU")
                        }
                        SmsManager.RESULT_ERROR_NO_SERVICE -> {
                            Log.e(TAG, "SMS no service for messageId=$messageId")
                            onResult("FAILED", "No SMS service")
                        }
                        else -> {
                            Log.e(TAG, "SMS unknown error $resultCode for messageId=$messageId")
                            onResult("FAILED", "Unknown error: $resultCode")
                        }
                    }
                }
            }

            // Register delivered receiver
            val deliveredReceiver = object : BroadcastReceiver() {
                override fun onReceive(ctx: Context, intent: Intent) {
                    ctx.unregisterReceiver(this)
                    when (resultCode) {
                        Activity.RESULT_OK -> {
                            Log.i(TAG, "SMS delivered for messageId=$messageId")
                            onResult("DELIVERED", null)
                        }
                        else -> {
                            Log.w(TAG, "SMS delivery report failure $resultCode for messageId=$messageId")
                            onResult("FAILED", "Delivery failed: $resultCode")
                        }
                    }
                }
            }

            // RECEIVER_EXPORTED is required: the SENT/DELIVERED broadcasts come from
            // the telephony system process, not from our app. RECEIVER_NOT_EXPORTED
            // silently blocks them, causing callbacks to never fire.
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                context.registerReceiver(
                    sentReceiver,
                    IntentFilter(sentAction),
                    Context.RECEIVER_EXPORTED
                )
                context.registerReceiver(
                    deliveredReceiver,
                    IntentFilter(deliveredAction),
                    Context.RECEIVER_EXPORTED
                )
            } else {
                context.registerReceiver(sentReceiver, IntentFilter(sentAction))
                context.registerReceiver(deliveredReceiver, IntentFilter(deliveredAction))
            }

            // Handle multi-part messages (>160 chars GSM-7)
            val parts = smsManager.divideMessage(message)
            if (parts.size > 1) {
                Log.i(TAG, "Sending multipart SMS (${parts.size} parts) to $phoneNumber for messageId=$messageId")
                val sentPIList = ArrayList<PendingIntent?>(parts.size).apply {
                    add(sentPI)
                    // Additional parts don't need sent PIs for our tracking
                    for (i in 1 until parts.size) add(null)
                }
                val deliveredPIList = ArrayList<PendingIntent?>(parts.size).apply {
                    add(deliveredPI)
                    for (i in 1 until parts.size) add(null)
                }
                smsManager.sendMultipartTextMessage(phoneNumber, null, parts, sentPIList, deliveredPIList)
            } else {
                Log.i(TAG, "Sending SMS to $phoneNumber for messageId=$messageId")
                smsManager.sendTextMessage(phoneNumber, null, message, sentPI, deliveredPI)
            }
        } catch (e: SecurityException) {
            Log.e(TAG, "SMS permission denied for messageId=$messageId", e)
            onResult("FAILED", "SMS permission denied: ${e.message}")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to send SMS for messageId=$messageId", e)
            onResult("FAILED", e.message ?: "Unknown error")
        }
    }

    @Suppress("DEPRECATION")
    private fun getSmsManagerForSlot(context: Context, simSlot: Int): SmsManager {
        try {
            val subscriptionManager = context.getSystemService(Context.TELEPHONY_SUBSCRIPTION_SERVICE) as? SubscriptionManager
            val subInfo = subscriptionManager?.getActiveSubscriptionInfoForSimSlotIndex(simSlot)
            if (subInfo != null) {
                Log.i(TAG, "Using SIM slot $simSlot (subscriptionId=${subInfo.subscriptionId}, carrier=${subInfo.carrierName})")
                return SmsManager.getSmsManagerForSubscriptionId(subInfo.subscriptionId)
            }
        } catch (e: SecurityException) {
            Log.w(TAG, "Cannot access subscription info for slot $simSlot — falling back to default", e)
        }
        // Fallback to default if slot not found or permission denied
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            context.getSystemService(SmsManager::class.java)
        } else {
            SmsManager.getDefault()
        }
    }
}
