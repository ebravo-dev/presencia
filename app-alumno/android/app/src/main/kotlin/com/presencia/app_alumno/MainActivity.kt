package com.presencia.app_alumno

import android.Manifest
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothManager
import android.content.Context
import android.content.Intent
import android.content.SharedPreferences
import android.content.pm.PackageManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.util.Log
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel
import org.json.JSONArray

class MainActivity : FlutterActivity() {

    companion object {
        private const val TAG = "BLE"
        private const val CHANNEL = "com.presencia.alumno/ble_background"
        private const val BLE_PERMISSION_REQUEST = 1001
    }

    private var flutterChannel: MethodChannel? = null
    private var prefs: SharedPreferences? = null
    private val mainHandler = Handler(Looper.getMainLooper())

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)

        prefs = getSharedPreferences(BleScanService.PREFS_NAME, Context.MODE_PRIVATE)

        flutterChannel = MethodChannel(flutterEngine.dartExecutor.binaryMessenger, CHANNEL)

        // Wire up callbacks from BleScanService → Flutter
        BleScanService.onBeaconDetected = { data ->
            mainHandler.post {
                flutterChannel?.invokeMethod("onBeaconDetected", data)
            }
        }
        BleScanService.onForegroundResult = { data ->
            mainHandler.post {
                flutterChannel?.invokeMethod("onScanResult", data)
            }
        }

        flutterChannel?.setMethodCallHandler { call, result ->
            when (call.method) {
                "startBackgroundScan" -> {
                    if (!hasBlePermissions()) {
                        requestBlePermissions()
                        result.success(false)
                        return@setMethodCallHandler
                    }
                    startScanService(BleScanService.ACTION_START_SCAN)
                    result.success(true)
                }
                "startForegroundScan" -> {
                    if (!hasBlePermissions()) {
                        requestBlePermissions()
                        result.success(false)
                        return@setMethodCallHandler
                    }
                    val timeout = (call.argument<Double>("timeout") ?: 8.0)
                    val intent = Intent(this, BleScanService::class.java).apply {
                        action = BleScanService.ACTION_FOREGROUND_SCAN
                        putExtra(BleScanService.EXTRA_TIMEOUT, timeout)
                    }
                    startForegroundServiceCompat(intent)
                    result.success(true)
                }
                "stopScan" -> {
                    startScanService(BleScanService.ACTION_STOP_SCAN)
                    result.success(true)
                }
                "isScanning" -> {
                    // Service is running if it was started
                    result.success(true)
                }
                "getBluetoothState" -> {
                    val btManager = getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager
                    val state = if (btManager?.adapter?.isEnabled == true) "on" else "off"
                    result.success(state)
                }
                "getPendingDetections" -> {
                    result.success(getPendingDetections())
                }
                "clearPendingDetections" -> {
                    prefs?.edit()?.remove("pending_detections")?.apply()
                    result.success(true)
                }
                "setMatricula" -> {
                    val matricula = call.arguments as? String
                    if (matricula != null) {
                        prefs?.edit()?.putString("student_matricula", matricula)?.apply()
                        Log.i(TAG, "📝 Matrícula set: $matricula")
                    }
                    result.success(true)
                }
                else -> result.notImplemented()
            }
        }
    }

    private fun startScanService(action: String) {
        val intent = Intent(this, BleScanService::class.java).apply {
            this.action = action
        }
        startForegroundServiceCompat(intent)
    }

    private fun startForegroundServiceCompat(intent: Intent) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            startForegroundService(intent)
        } else {
            startService(intent)
        }
    }

    private fun hasBlePermissions(): Boolean {
        val base = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            ContextCompat.checkSelfPermission(this, Manifest.permission.BLUETOOTH_SCAN) == PackageManager.PERMISSION_GRANTED &&
            ContextCompat.checkSelfPermission(this, Manifest.permission.BLUETOOTH_CONNECT) == PackageManager.PERMISSION_GRANTED
        } else {
            ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED
        }
        // Android 13+ needs POST_NOTIFICATIONS for foreground service notification
        val notif = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED
        } else true
        return base && notif
    }

    private fun requestBlePermissions() {
        val perms = mutableListOf<String>()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            perms.add(Manifest.permission.BLUETOOTH_SCAN)
            perms.add(Manifest.permission.BLUETOOTH_CONNECT)
        }
        perms.add(Manifest.permission.ACCESS_FINE_LOCATION)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            perms.add(Manifest.permission.POST_NOTIFICATIONS)
        }
        ActivityCompat.requestPermissions(this, perms.toTypedArray(), BLE_PERMISSION_REQUEST)
    }

    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode == BLE_PERMISSION_REQUEST && grantResults.all { it == PackageManager.PERMISSION_GRANTED }) {
            Log.i(TAG, "✅ All BLE permissions granted, starting service")
            startScanService(BleScanService.ACTION_START_SCAN)
        }
    }

    private fun getPendingDetections(): List<Map<String, Any>> {
        val pendingJson = prefs?.getString("pending_detections", "[]") ?: "[]"
        return try {
            val arr = JSONArray(pendingJson)
            (0 until arr.length()).map { i ->
                val obj = arr.getJSONObject(i)
                obj.keys().asSequence().associateWith { key -> obj.get(key) }
            }
        } catch (_: Exception) { emptyList() }
    }
}
