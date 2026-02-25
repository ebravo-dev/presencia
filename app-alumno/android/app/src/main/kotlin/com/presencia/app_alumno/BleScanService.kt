package com.presencia.app_alumno

import android.app.*
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothManager
import android.bluetooth.le.BluetoothLeScanner
import android.bluetooth.le.ScanCallback
import android.bluetooth.le.ScanFilter
import android.bluetooth.le.ScanResult
import android.bluetooth.le.ScanSettings
import android.content.Context
import android.content.Intent
import android.content.SharedPreferences
import android.content.pm.ServiceInfo
import android.os.*
import android.util.Log
import androidx.core.app.NotificationCompat
import org.json.JSONArray
import org.json.JSONObject
import java.io.OutputStreamWriter
import java.net.HttpURLConnection
import java.net.URL
import java.text.SimpleDateFormat
import java.util.*
import java.util.concurrent.Executors

class BleScanService : Service() {

    companion object {
        private const val TAG = "BLE"
        const val BEACON_SERVICE_UUID = "12345678-1234-1234-1234-123456789abc"
        const val BEACON_NAME = "ESP32-C3_BLE"
        const val BACKEND_URL = "https://apipresencia.110694.xyz/api/student-attendance"
        const val COOLDOWN_MS = 300_000L // 5 minutes
        const val SCAN_RESTART_MS = 30_000L // 30 seconds
        const val PREFS_NAME = "ble_prefs"

        private const val NOTIFICATION_ID = 9001
        private const val CHANNEL_ID = "ble_scan_channel"

        const val ACTION_START_SCAN = "com.presencia.START_SCAN"
        const val ACTION_STOP_SCAN = "com.presencia.STOP_SCAN"
        const val ACTION_FOREGROUND_SCAN = "com.presencia.FOREGROUND_SCAN"
        const val EXTRA_TIMEOUT = "timeout"

        // Static reference so MainActivity can relay detection events to Flutter
        @Volatile
        var onBeaconDetected: ((Map<String, Any>) -> Unit)? = null
        @Volatile
        var onForegroundResult: ((Map<String, Any>) -> Unit)? = null
    }

    private var bluetoothAdapter: BluetoothAdapter? = null
    private var bleScanner: BluetoothLeScanner? = null
    private var prefs: SharedPreferences? = null
    private val mainHandler = Handler(Looper.getMainLooper())
    private val executor = Executors.newSingleThreadExecutor()
    private var isScanning = false
    private var isForegroundScanActive = false
    private var foregroundTimeoutRunnable: Runnable? = null
    private var scanRestartRunnable: Runnable? = null

    private val scanCallback = object : ScanCallback() {
        override fun onScanResult(callbackType: Int, result: ScanResult) {
            val name = result.device.name
                ?: result.scanRecord?.deviceName
                ?: ""

            val hasServiceUuid = result.scanRecord?.serviceUuids?.any {
                it.uuid.toString().equals(BEACON_SERVICE_UUID, ignoreCase = true)
            } ?: false

            if (hasServiceUuid || name.equals(BEACON_NAME, ignoreCase = true)) {
                Log.i(TAG, "✅ Beacon detected: $name (RSSI: ${result.rssi})")
                handleBeaconDetected(
                    name = name.ifEmpty { BEACON_NAME },
                    deviceId = result.device.address,
                    rssi = result.rssi
                )
            }
        }

        override fun onScanFailed(errorCode: Int) {
            Log.e(TAG, "❌ Scan failed with error: $errorCode")
            isScanning = false
        }
    }

    override fun onCreate() {
        super.onCreate()
        prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        val btManager = getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager
        bluetoothAdapter = btManager?.adapter
        bleScanner = bluetoothAdapter?.bluetoothLeScanner
        createNotificationChannel()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_START_SCAN -> {
                startForegroundWithNotification()
                startContinuousScan()
            }
            ACTION_FOREGROUND_SCAN -> {
                val timeout = intent.getDoubleExtra(EXTRA_TIMEOUT, 8.0)
                startForegroundWithNotification()
                startForegroundScanMode(timeout)
            }
            ACTION_STOP_SCAN -> {
                stopForegroundScanMode()
            }
        }
        return START_STICKY // Restart if killed by system
    }

    override fun onBind(intent: Intent?): IBinder? = null

    // MARK: - Foreground Notification

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "Escaneo BLE",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "Buscando beacon de asistencia"
                setShowBadge(false)
            }
            val nm = getSystemService(NotificationManager::class.java)
            nm.createNotificationChannel(channel)
        }
    }

    private fun startForegroundWithNotification() {
        val notification = buildNotification("Buscando beacon de asistencia...")

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

    // MARK: - Scanning

    private fun startContinuousScan() {
        if (bluetoothAdapter?.isEnabled != true) {
            Log.w(TAG, "⚠️ Bluetooth not enabled")
            return
        }

        // Stop existing to reset duplicate filter
        if (isScanning) {
            try { bleScanner?.stopScan(scanCallback) } catch (_: SecurityException) {}
            isScanning = false
        }

        val filter = ScanFilter.Builder()
            .setServiceUuid(ParcelUuid.fromString(BEACON_SERVICE_UUID))
            .build()

        val settings = ScanSettings.Builder()
            .setScanMode(ScanSettings.SCAN_MODE_LOW_POWER) // Low power for background longevity
            .setReportDelay(0)
            .build()

        try {
            bleScanner?.startScan(listOf(filter), settings, scanCallback)
            isScanning = true
            Log.i(TAG, "🔍 BLE scan started (foreground service)")
        } catch (e: SecurityException) {
            Log.e(TAG, "❌ SecurityException starting scan: ${e.message}")
            return
        }

        scheduleScanRestart()
    }

    private fun scheduleScanRestart() {
        scanRestartRunnable?.let { mainHandler.removeCallbacks(it) }
        scanRestartRunnable = Runnable {
            if (isScanning) {
                Log.d(TAG, "🔄 Restarting scan to reset duplicate filter")
                startContinuousScan()
            }
        }
        mainHandler.postDelayed(scanRestartRunnable!!, SCAN_RESTART_MS)
    }

    private fun startForegroundScanMode(timeout: Double) {
        isForegroundScanActive = true

        // Force restart with high power for foreground
        if (isScanning) {
            try { bleScanner?.stopScan(scanCallback) } catch (_: SecurityException) {}
            isScanning = false
        }

        val filter = ScanFilter.Builder()
            .setServiceUuid(ParcelUuid.fromString(BEACON_SERVICE_UUID))
            .build()

        val settings = ScanSettings.Builder()
            .setScanMode(ScanSettings.SCAN_MODE_LOW_LATENCY) // Full power for foreground
            .setReportDelay(0)
            .build()

        try {
            bleScanner?.startScan(listOf(filter), settings, scanCallback)
            isScanning = true
            Log.i(TAG, "🔍 Foreground scan started (HIGH POWER)")
        } catch (e: SecurityException) {
            Log.e(TAG, "❌ SecurityException: ${e.message}")
        }

        foregroundTimeoutRunnable?.let { mainHandler.removeCallbacks(it) }
        foregroundTimeoutRunnable = Runnable {
            if (isForegroundScanActive) {
                isForegroundScanActive = false
                Log.i(TAG, "⏰ Foreground scan timed out")
                onForegroundResult?.invoke(mapOf("result" to "timeout"))
                // Switch back to low power continuous scan
                startContinuousScan()
            }
        }
        mainHandler.postDelayed(foregroundTimeoutRunnable!!, (timeout * 1000).toLong())
    }

    private fun stopForegroundScanMode() {
        isForegroundScanActive = false
        foregroundTimeoutRunnable?.let { mainHandler.removeCallbacks(it) }
        foregroundTimeoutRunnable = null
        // Switch back to low power continuous scan
        startContinuousScan()
    }

    // MARK: - Detection Handling

    private fun handleBeaconDetected(name: String, deviceId: String, rssi: Int) {
        val now = System.currentTimeMillis()

        val lastDetection = prefs?.getLong("lastDetection", 0) ?: 0
        if (now - lastDetection < COOLDOWN_MS) {
            Log.i(TAG, "⏳ Cooldown active, skipping (${(now - lastDetection) / 1000}s ago)")
            if (isForegroundScanActive) {
                isForegroundScanActive = false
                foregroundTimeoutRunnable?.let { mainHandler.removeCallbacks(it) }
                onForegroundResult?.invoke(mapOf("result" to "cooldown"))
                startContinuousScan()
            }
            return
        }

        prefs?.edit()?.putLong("lastDetection", now)?.apply()

        val matricula = prefs?.getString("student_matricula", "unknown") ?: "unknown"
        val timestamp = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US).apply {
            timeZone = TimeZone.getTimeZone("UTC")
        }.format(Date(now))

        Log.i(TAG, "✅ BEACON DETECTED! Matrícula: $matricula, RSSI: $rssi")

        savePendingDetection(name, deviceId, rssi, timestamp, matricula)
        postToBackend(matricula, name, timestamp)
        updateNotification("✅ Asistencia registrada (${timestamp.substring(11, 16)})")

        val data = mapOf(
            "name" to name,
            "deviceId" to deviceId,
            "rssi" to rssi,
            "timestamp" to timestamp
        )

        if (isForegroundScanActive) {
            isForegroundScanActive = false
            foregroundTimeoutRunnable?.let { mainHandler.removeCallbacks(it) }
            onForegroundResult?.invoke(mapOf(
                "result" to "detected",
                "name" to name,
                "deviceId" to deviceId,
                "rssi" to rssi,
                "timestamp" to timestamp
            ))
            startContinuousScan()
        }

        onBeaconDetected?.invoke(data)
    }

    // MARK: - SharedPreferences Persistence

    private fun savePendingDetection(name: String, deviceId: String, rssi: Int, timestamp: String, matricula: String) {
        val pendingJson = prefs?.getString("pending_detections", "[]") ?: "[]"
        val pending = try {
            val arr = JSONArray(pendingJson)
            (0 until arr.length()).map { arr.getJSONObject(it) }.toMutableList()
        } catch (_: Exception) { mutableListOf() }

        val entry = JSONObject().apply {
            put("name", name)
            put("deviceId", deviceId)
            put("rssi", rssi)
            put("timestamp", timestamp)
            put("matricula", matricula)
        }
        pending.add(entry)

        val arr = JSONArray()
        pending.forEach { arr.put(it) }
        prefs?.edit()?.putString("pending_detections", arr.toString())?.apply()
        Log.i(TAG, "💾 Saved to SharedPreferences (${pending.size} pending)")
    }

    // MARK: - Native HTTP POST

    private fun postToBackend(matricula: String, beaconId: String, timestamp: String) {
        executor.execute {
            try {
                val url = URL(BACKEND_URL)
                val conn = url.openConnection() as HttpURLConnection
                conn.requestMethod = "POST"
                conn.setRequestProperty("Content-Type", "application/json")
                conn.connectTimeout = 10_000
                conn.readTimeout = 10_000
                conn.doOutput = true

                val body = JSONObject().apply {
                    put("studentName", matricula)
                    put("matricula", matricula)
                    put("beaconId", beaconId)
                    put("detectedAt", timestamp)
                    put("deviceInfo", "Android (native)")
                }

                OutputStreamWriter(conn.outputStream).use { it.write(body.toString()) }
                val code = conn.responseCode
                Log.i(TAG, "📤 Backend POST: HTTP $code")
                conn.disconnect()
            } catch (e: Exception) {
                Log.e(TAG, "❌ Backend POST failed: ${e.message}")
            }
        }
    }

    override fun onDestroy() {
        scanRestartRunnable?.let { mainHandler.removeCallbacks(it) }
        foregroundTimeoutRunnable?.let { mainHandler.removeCallbacks(it) }
        if (isScanning) {
            try { bleScanner?.stopScan(scanCallback) } catch (_: SecurityException) {}
            isScanning = false
        }
        super.onDestroy()
    }
}
