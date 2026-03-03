package com.presencia.app_alumno

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import android.util.Log

/**
 * Restarts BLE advertiser service after device boot or after scheduled AlarmManager restart.
 */
class BootReceiver : BroadcastReceiver() {

    companion object {
        private const val TAG = "BLE"
        const val ACTION_RESTART_SERVICE = "com.presencia.RESTART_BLE_SERVICE"
    }

    override fun onReceive(context: Context, intent: Intent) {
        val action = intent.action
        if (action == Intent.ACTION_BOOT_COMPLETED ||
            action == Intent.ACTION_MY_PACKAGE_REPLACED ||
            action == ACTION_RESTART_SERVICE
        ) {
            Log.i(TAG, "🔄 BootReceiver triggered ($action) — restarting BLE advertiser")
            val serviceIntent = Intent(context, BleAdvertiserService::class.java).apply {
                this.action = BleAdvertiserService.ACTION_START
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(serviceIntent)
            } else {
                context.startService(serviceIntent)
            }
        }
    }
}
