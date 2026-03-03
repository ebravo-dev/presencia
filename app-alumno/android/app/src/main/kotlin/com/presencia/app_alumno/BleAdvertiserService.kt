package com.presencia.app_alumno

import android.app.*
import android.bluetooth.*
import android.bluetooth.le.AdvertiseCallback
import android.bluetooth.le.AdvertiseData
import android.bluetooth.le.AdvertiseSettings
import android.bluetooth.le.BluetoothLeAdvertiser
import android.content.Context
import android.content.Intent
import android.content.SharedPreferences
import android.content.pm.ServiceInfo
import android.os.*
import android.util.Log
import androidx.core.app.NotificationCompat
import java.util.*

/**
 * BLE GATT Server + Advertiser service.
 * Exposes student matrícula via GATT READ characteristic.
 * Professor app connects, reads matrícula, optionally writes confirmation.
 */
class BleAdvertiserService : Service() {

    companion object {
        private const val TAG = "BLE"
        val SERVICE_UUID: UUID = UUID.fromString("12345678-1234-1234-1234-123456789abc")
        val MATRICULA_CHAR_UUID: UUID = UUID.fromString("12345678-1234-1234-1234-000000000001") // READ
        val CONFIRM_CHAR_UUID: UUID = UUID.fromString("12345678-1234-1234-1234-000000000002")   // WRITE
        const val PREFS_NAME = "ble_prefs"

        private const val NOTIFICATION_ID = 9001
        private const val CHANNEL_ID = "ble_advertiser_channel"

        const val ACTION_START = "com.presencia.START_ADVERTISE"
        const val ACTION_STOP = "com.presencia.STOP_ADVERTISE"

        // Callbacks to relay events to Flutter via MainActivity
        @Volatile
        var onAdvertisingStateChanged: ((Boolean) -> Unit)? = null
        @Volatile
        var onAttendanceConfirmed: ((String) -> Unit)? = null
        @Volatile
        var onMatriculaRead: (() -> Unit)? = null
    }

    private var bluetoothAdapter: BluetoothAdapter? = null
    private var advertiser: BluetoothLeAdvertiser? = null
    private var gattServer: BluetoothGattServer? = null
    private var prefs: SharedPreferences? = null
    private var isAdvertising = false

    private val advertiseCallback = object : AdvertiseCallback() {
        override fun onStartSuccess(settingsInEffect: AdvertiseSettings?) {
            isAdvertising = true
            Log.i(TAG, "✅ BLE advertising started")
            updateNotification("📡 Emitiendo matrícula por BLE")
            onAdvertisingStateChanged?.invoke(true)
        }

        override fun onStartFailure(errorCode: Int) {
            isAdvertising = false
            Log.e(TAG, "❌ Advertising failed: error $errorCode")
            onAdvertisingStateChanged?.invoke(false)
        }
    }

    private val gattServerCallback = object : BluetoothGattServerCallback() {
        override fun onConnectionStateChange(device: BluetoothDevice, status: Int, newState: Int) {
            val state = if (newState == BluetoothProfile.STATE_CONNECTED) "connected" else "disconnected"
            Log.i(TAG, "📱 Device $state: ${device.address}")
        }

        override fun onCharacteristicReadRequest(
            device: BluetoothDevice,
            requestId: Int,
            offset: Int,
            characteristic: BluetoothGattCharacteristic
        ) {
            if (characteristic.uuid == MATRICULA_CHAR_UUID) {
                val matricula = prefs?.getString("student_matricula", "") ?: ""
                val data = matricula.toByteArray(Charsets.UTF_8)
                Log.i(TAG, "📖 Matrícula read by professor: $matricula")

                if (offset > data.size) {
                    gattServer?.sendResponse(device, requestId, BluetoothGatt.GATT_INVALID_OFFSET, offset, null)
                    return
                }

                val responseData = data.copyOfRange(offset, data.size)
                gattServer?.sendResponse(device, requestId, BluetoothGatt.GATT_SUCCESS, offset, responseData)
                onMatriculaRead?.invoke()
            } else {
                gattServer?.sendResponse(device, requestId, BluetoothGatt.GATT_FAILURE, 0, null)
            }
        }

        override fun onCharacteristicWriteRequest(
            device: BluetoothDevice,
            requestId: Int,
            characteristic: BluetoothGattCharacteristic,
            preparedWrite: Boolean,
            responseNeeded: Boolean,
            offset: Int,
            value: ByteArray?
        ) {
            if (characteristic.uuid == CONFIRM_CHAR_UUID) {
                val message = value?.toString(Charsets.UTF_8) ?: ""
                Log.i(TAG, "✅ Confirmation received from professor: $message")
                onAttendanceConfirmed?.invoke(message)

                if (responseNeeded) {
                    gattServer?.sendResponse(device, requestId, BluetoothGatt.GATT_SUCCESS, 0, null)
                }
            } else {
                if (responseNeeded) {
                    gattServer?.sendResponse(device, requestId, BluetoothGatt.GATT_FAILURE, 0, null)
                }
            }
        }
    }

    override fun onCreate() {
        super.onCreate()
        prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        val btManager = getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager
        bluetoothAdapter = btManager?.adapter
        advertiser = bluetoothAdapter?.bluetoothLeAdvertiser
        createNotificationChannel()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_START -> {
                startForegroundWithNotification()
                setupGattServer()
                startAdvertising()
            }
            ACTION_STOP -> {
                stopAdvertising()
                stopSelf()
            }
        }
        return START_STICKY
    }

    override fun onBind(intent: Intent?): IBinder? = null

    // MARK: - Notification

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "BLE Presencia",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "Emitiendo matrícula por BLE"
                setShowBadge(false)
            }
            val nm = getSystemService(NotificationManager::class.java)
            nm.createNotificationChannel(channel)
        }
    }

    private fun startForegroundWithNotification() {
        val notification = buildNotification("Iniciando emisión BLE...")
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_CONNECTED_DEVICE)
        } else {
            startForeground(NOTIFICATION_ID, notification)
        }
    }

    private fun buildNotification(text: String): Notification {
        val launchIntent = packageManager.getLaunchIntentForPackage(packageName)
        val pendingIntent = PendingIntent.getActivity(
            this, 0, launchIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
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
        val nm = getSystemService(NotificationManager::class.java)
        nm.notify(NOTIFICATION_ID, buildNotification(text))
    }

    // MARK: - GATT Server

    private fun setupGattServer() {
        val btManager = getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager ?: return

        gattServer = try {
            btManager.openGattServer(this, gattServerCallback)
        } catch (e: SecurityException) {
            Log.e(TAG, "❌ SecurityException opening GATT server: ${e.message}")
            return
        }

        val matriculaChar = BluetoothGattCharacteristic(
            MATRICULA_CHAR_UUID,
            BluetoothGattCharacteristic.PROPERTY_READ,
            BluetoothGattCharacteristic.PERMISSION_READ
        )

        val confirmChar = BluetoothGattCharacteristic(
            CONFIRM_CHAR_UUID,
            BluetoothGattCharacteristic.PROPERTY_WRITE or BluetoothGattCharacteristic.PROPERTY_WRITE_NO_RESPONSE,
            BluetoothGattCharacteristic.PERMISSION_WRITE
        )

        val service = BluetoothGattService(SERVICE_UUID, BluetoothGattService.SERVICE_TYPE_PRIMARY)
        service.addCharacteristic(matriculaChar)
        service.addCharacteristic(confirmChar)

        try {
            gattServer?.addService(service)
            Log.i(TAG, "✅ GATT server + service added")
        } catch (e: SecurityException) {
            Log.e(TAG, "❌ SecurityException adding service: ${e.message}")
        }
    }

    // MARK: - Advertising

    private fun startAdvertising() {
        if (bluetoothAdapter?.isEnabled != true) {
            Log.w(TAG, "⚠️ Bluetooth not enabled")
            return
        }
        if (advertiser == null) {
            Log.e(TAG, "❌ BLE advertising not supported on this device")
            return
        }

        val settings = AdvertiseSettings.Builder()
            .setAdvertiseMode(AdvertiseSettings.ADVERTISE_MODE_LOW_POWER)
            .setTxPowerLevel(AdvertiseSettings.ADVERTISE_TX_POWER_MEDIUM)
            .setConnectable(true)
            .setTimeout(0) // Advertise indefinitely
            .build()

        val data = AdvertiseData.Builder()
            .setIncludeDeviceName(false) // Save space in advertising packet
            .addServiceUuid(ParcelUuid(SERVICE_UUID))
            .build()

        val scanResponse = AdvertiseData.Builder()
            .setIncludeDeviceName(true)
            .build()

        try {
            advertiser?.startAdvertising(settings, data, scanResponse, advertiseCallback)
            Log.i(TAG, "📡 Starting BLE advertising...")
        } catch (e: SecurityException) {
            Log.e(TAG, "❌ SecurityException starting advertising: ${e.message}")
        }
    }

    private fun stopAdvertising() {
        try {
            advertiser?.stopAdvertising(advertiseCallback)
        } catch (_: SecurityException) {}
        isAdvertising = false

        try {
            gattServer?.close()
        } catch (_: Exception) {}
        gattServer = null

        onAdvertisingStateChanged?.invoke(false)
        Log.i(TAG, "🛑 Stopped advertising + GATT server")
    }

    override fun onTaskRemoved(rootIntent: Intent?) {
        super.onTaskRemoved(rootIntent)
        Log.i(TAG, "🔄 onTaskRemoved — scheduling restart")
        scheduleRestart()
    }

    override fun onDestroy() {
        stopAdvertising()
        Log.i(TAG, "🔄 onDestroy — scheduling restart")
        scheduleRestart()
        super.onDestroy()
    }

    private fun scheduleRestart() {
        val intent = Intent(this, BootReceiver::class.java).apply {
            action = BootReceiver.ACTION_RESTART_SERVICE
        }
        val pendingIntent = PendingIntent.getBroadcast(
            this, 0, intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        val alarmManager = getSystemService(Context.ALARM_SERVICE) as AlarmManager
        alarmManager.setExactAndAllowWhileIdle(
            AlarmManager.ELAPSED_REALTIME_WAKEUP,
            SystemClock.elapsedRealtime() + 5_000,
            pendingIntent
        )
    }
}
