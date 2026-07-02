package com.presencia.app_alumno

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.bluetooth.le.AdvertiseCallback
import android.bluetooth.le.AdvertiseSettings
import android.content.Context
import android.content.Intent
import android.content.SharedPreferences
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import android.util.Log
import androidx.core.app.NotificationCompat
import org.altbeacon.beacon.Beacon
import org.altbeacon.beacon.BeaconParser
import org.altbeacon.beacon.BeaconTransmitter

class BleAdvertiserService : Service() {

    companion object {
        private const val TAG = "StudentBeacon"
        const val PREFS_NAME = "ble_prefs"

        private const val NOTIFICATION_ID = 9001
        private const val CHANNEL_ID = "student_beacon_advertiser"

        const val ACTION_START = "com.presencia.START_ADVERTISE"
        const val ACTION_STOP = "com.presencia.STOP_ADVERTISE"

        const val EXTRA_UUID = "uuid"
        const val EXTRA_MAJOR = "major"
        const val EXTRA_MINOR = "minor"
        const val EXTRA_MEASURED_POWER = "measuredPower"

        private const val DEFAULT_MAJOR = 1
        private const val DEFAULT_MINOR = 1
        private const val DEFAULT_MEASURED_POWER = -59

        @Volatile
        var onAdvertisingStateChanged: ((Boolean) -> Unit)? = null
    }

    private var beaconTransmitter: BeaconTransmitter? = null
    private var prefs: SharedPreferences? = null

    private val advertiseCallback = object : AdvertiseCallback() {
        override fun onStartSuccess(settingsInEffect: AdvertiseSettings?) {
            Log.i(TAG, "Student iBeacon advertising started")
            updateNotification("Asistencia activa")
            onAdvertisingStateChanged?.invoke(true)
        }

        override fun onStartFailure(errorCode: Int) {
            Log.e(TAG, "Student iBeacon advertising failed: $errorCode")
            onAdvertisingStateChanged?.invoke(false)
            stopSelf()
        }
    }

    override fun onCreate() {
        super.onCreate()
        prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        createNotificationChannel()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_START -> {
                startForegroundWithNotification()
                val uuid = intent.getStringExtra(EXTRA_UUID)
                    ?: prefs?.getString("student_attendance_uuid", null)
                val major = intent.getIntExtra(EXTRA_MAJOR, DEFAULT_MAJOR)
                val minor = intent.getIntExtra(EXTRA_MINOR, DEFAULT_MINOR)
                val measuredPower = intent.getIntExtra(
                    EXTRA_MEASURED_POWER,
                    DEFAULT_MEASURED_POWER,
                )
                startAdvertising(uuid, major, minor, measuredPower)
            }
            ACTION_STOP -> {
                stopAdvertising()
                stopSelf()
            }
        }
        return START_STICKY
    }

    override fun onBind(intent: Intent?): IBinder? = null

    private fun startAdvertising(
        uuid: String?,
        major: Int,
        minor: Int,
        measuredPower: Int,
    ) {
        if (uuid.isNullOrBlank()) {
            Log.e(TAG, "Missing student attendance UUID")
            onAdvertisingStateChanged?.invoke(false)
            stopSelf()
            return
        }

        val support = BeaconTransmitter.checkTransmissionSupported(this)
        if (support != BeaconTransmitter.SUPPORTED) {
            Log.e(TAG, "Beacon transmission unsupported: $support")
            onAdvertisingStateChanged?.invoke(false)
            stopSelf()
            return
        }

        stopAdvertising()

        val parser = BeaconParser()
            .setBeaconLayout("m:2-3=0215,i:4-19,i:20-21,i:22-23,p:24-24")
        val beacon = Beacon.Builder()
            .setId1(uuid)
            .setId2(major.toString())
            .setId3(minor.toString())
            .setManufacturer(0x004C)
            .setTxPower(measuredPower)
            .build()

        beaconTransmitter = BeaconTransmitter(applicationContext, parser).apply {
            advertiseMode = AdvertiseSettings.ADVERTISE_MODE_BALANCED
            advertiseTxPowerLevel = AdvertiseSettings.ADVERTISE_TX_POWER_MEDIUM
            startAdvertising(beacon, advertiseCallback)
        }
    }

    private fun stopAdvertising() {
        try {
            if (beaconTransmitter?.isStarted == true) {
                beaconTransmitter?.stopAdvertising()
            }
        } catch (error: Exception) {
            Log.w(TAG, "Error stopping beacon advertising: ${error.message}")
        }
        beaconTransmitter = null
        onAdvertisingStateChanged?.invoke(false)
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "Asistencia automatica",
                NotificationManager.IMPORTANCE_LOW,
            ).apply {
                description = "Registro automatico de asistencia"
                setShowBadge(false)
            }
            val manager = getSystemService(NotificationManager::class.java)
            manager.createNotificationChannel(channel)
        }
    }

    private fun startForegroundWithNotification() {
        val notification = buildNotification("Iniciando asistencia")
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            startForeground(
                NOTIFICATION_ID,
                notification,
                ServiceInfo.FOREGROUND_SERVICE_TYPE_CONNECTED_DEVICE,
            )
        } else {
            startForeground(NOTIFICATION_ID, notification)
        }
    }

    private fun buildNotification(text: String): Notification {
        val launchIntent = packageManager.getLaunchIntentForPackage(packageName)
        val pendingIntent = PendingIntent.getActivity(
            this,
            0,
            launchIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("Presencia")
            .setContentText(text)
            .setSmallIcon(android.R.drawable.stat_sys_data_bluetooth)
            .setOngoing(true)
            .setContentIntent(pendingIntent)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .build()
    }

    private fun updateNotification(text: String) {
        val manager = getSystemService(NotificationManager::class.java)
        manager.notify(NOTIFICATION_ID, buildNotification(text))
    }

    override fun onDestroy() {
        stopAdvertising()
        super.onDestroy()
    }
}
