package com.presencia.app_alumno

import android.Manifest
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

class MainActivity : FlutterActivity() {

    companion object {
        private const val TAG = "BLE"
        private const val CHANNEL = "com.presencia.alumno/ble_advertiser"
        private const val BLE_PERMISSION_REQUEST = 1001
    }

    private var flutterChannel: MethodChannel? = null
    private var prefs: SharedPreferences? = null
    private val mainHandler = Handler(Looper.getMainLooper())

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)

        prefs = getSharedPreferences(BleAdvertiserService.PREFS_NAME, Context.MODE_PRIVATE)

        flutterChannel = MethodChannel(flutterEngine.dartExecutor.binaryMessenger, CHANNEL)

        // Wire up callbacks from BleAdvertiserService → Flutter
        BleAdvertiserService.onAdvertisingStateChanged = { advertising ->
            mainHandler.post {
                flutterChannel?.invokeMethod("onAdvertisingStateChanged", advertising)
            }
        }
        BleAdvertiserService.onAttendanceConfirmed = { message ->
            mainHandler.post {
                flutterChannel?.invokeMethod("onAttendanceConfirmed", message)
            }
        }
        BleAdvertiserService.onMatriculaRead = {
            mainHandler.post {
                flutterChannel?.invokeMethod("onMatriculaRead", null)
            }
        }

        flutterChannel?.setMethodCallHandler { call, result ->
            when (call.method) {
                "startAdvertising" -> {
                    if (!hasBlePermissions()) {
                        requestBlePermissions()
                        result.success(false)
                        return@setMethodCallHandler
                    }
                    startAdvertiserService(BleAdvertiserService.ACTION_START)
                    result.success(true)
                }
                "stopAdvertising" -> {
                    startAdvertiserService(BleAdvertiserService.ACTION_STOP)
                    result.success(true)
                }
                "isAdvertising" -> {
                    result.success(true)
                }
                "getBluetoothState" -> {
                    val btManager = getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager
                    val state = if (btManager?.adapter?.isEnabled == true) "on" else "off"
                    result.success(state)
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

    private fun startAdvertiserService(action: String) {
        val intent = Intent(this, BleAdvertiserService::class.java).apply {
            this.action = action
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            startForegroundService(intent)
        } else {
            startService(intent)
        }
    }

    private fun hasBlePermissions(): Boolean {
        val base = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            ContextCompat.checkSelfPermission(this, Manifest.permission.BLUETOOTH_ADVERTISE) == PackageManager.PERMISSION_GRANTED &&
            ContextCompat.checkSelfPermission(this, Manifest.permission.BLUETOOTH_CONNECT) == PackageManager.PERMISSION_GRANTED
        } else {
            ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED
        }
        val notif = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED
        } else true
        return base && notif
    }

    private fun requestBlePermissions() {
        val perms = mutableListOf<String>()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            perms.add(Manifest.permission.BLUETOOTH_ADVERTISE)
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
            Log.i(TAG, "✅ All BLE permissions granted, starting advertiser")
            startAdvertiserService(BleAdvertiserService.ACTION_START)
        }
    }
}
