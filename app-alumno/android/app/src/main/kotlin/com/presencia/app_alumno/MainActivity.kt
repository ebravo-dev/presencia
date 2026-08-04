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

        AltBeaconScannerPlugin(this).register(flutterEngine.dartExecutor.binaryMessenger)

        flutterChannel?.setMethodCallHandler { call, result ->
            when (call.method) {
                "startAdvertising" -> {
                    if (!hasBlePermissions()) {
                        requestBlePermissions()
                        result.success(false)
                        return@setMethodCallHandler
                    }
                    val args = call.arguments as? Map<*, *>
                    val uuid = args?.get("uuid") as? String
                        ?: prefs?.getString("student_attendance_uuid", null)
                    val major = (args?.get("major") as? Number)?.toInt() ?: 1
                    val minor = (args?.get("minor") as? Number)?.toInt() ?: 1
                    val measuredPower = (args?.get("measuredPower") as? Number)?.toInt() ?: -59
                    if (uuid.isNullOrBlank()) {
                        result.error("MISSING_UUID", "No hay UUID de asistencia del alumno", null)
                        return@setMethodCallHandler
                    }
                    startAdvertiserService(
                        BleAdvertiserService.ACTION_START,
                        uuid,
                        major,
                        minor,
                        measuredPower,
                    )
                    result.success(true)
                }
                "stopAdvertising" -> {
                    stopAdvertiserService()
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
                "setStudentIdentity" -> {
                    val args = call.arguments as? Map<*, *>
                    val matricula = args?.get("matricula") as? String
                    val attendanceUuid = args?.get("attendanceUuid") as? String
                    val deviceBindingId = args?.get("deviceBindingId") as? String
                    prefs?.edit()?.apply {
                        if (matricula != null) putString("student_matricula", matricula)
                        if (attendanceUuid != null) {
                            putString("student_attendance_uuid", attendanceUuid)
                        }
                        if (deviceBindingId != null) {
                            putString("student_device_binding_id", deviceBindingId)
                        }
                    }?.apply()
                    Log.i(TAG, "Student identity set: $matricula / $attendanceUuid / $deviceBindingId")
                    result.success(true)
                }
                else -> result.notImplemented()
            }
        }
    }

    private fun startAdvertiserService(
        action: String,
        uuid: String? = null,
        major: Int = 1,
        minor: Int = 1,
        measuredPower: Int = -59,
    ) {
        val intent = Intent(this, BleAdvertiserService::class.java).apply {
            this.action = action
            if (uuid != null) {
                putExtra(BleAdvertiserService.EXTRA_UUID, uuid)
                putExtra(BleAdvertiserService.EXTRA_MAJOR, major)
                putExtra(BleAdvertiserService.EXTRA_MINOR, minor)
                putExtra(BleAdvertiserService.EXTRA_MEASURED_POWER, measuredPower)
            }
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            startForegroundService(intent)
        } else {
            startService(intent)
        }
    }

    /**
     * Stopping must never use startForegroundService. The BLE service can
     * already be shutting itself down after a GATT confirmation; starting a
     * new instance with ACTION_STOP would make Android wait for a
     * startForeground() call that a stop-only instance intentionally never
     * performs, causing RemoteServiceException.
     */
    private fun stopAdvertiserService() {
        stopService(Intent(this, BleAdvertiserService::class.java))
    }

    private fun hasBlePermissions(): Boolean {
        val base = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            ContextCompat.checkSelfPermission(this, Manifest.permission.BLUETOOTH_SCAN) == PackageManager.PERMISSION_GRANTED &&
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
            perms.add(Manifest.permission.BLUETOOTH_SCAN)
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
