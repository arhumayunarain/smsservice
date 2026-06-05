package com.smsservice.app.receiver

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log
import com.smsservice.app.service.SmsGatewayService

class BootReceiver : BroadcastReceiver() {

    companion object {
        private const val TAG = "BootReceiver"
    }

    override fun onReceive(context: Context, intent: Intent) {
        val action = intent.action
        if (action == Intent.ACTION_BOOT_COMPLETED || action == "android.intent.action.LOCKED_BOOT_COMPLETED") {
            Log.i(TAG, "Boot completed ($action) — starting SmsGatewayService")
            val serviceIntent = Intent(context, SmsGatewayService::class.java)
            context.startForegroundService(serviceIntent)
        }
    }
}
